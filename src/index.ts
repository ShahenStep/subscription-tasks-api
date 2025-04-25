import { Router } from 'itty-router';


interface Env {
  DB: D1Database;
}

interface SubscriptionTask {
  id: number;
  botToken: string;
  text: string;
  requiredSubscriptionsCount: number;
  initialSubscriptionsCount: number;
  type: 'channel' | 'bot';  
  entityUsername: string;   
}

interface SubscriptionTaskResponse {
  id: number;
  text: string;
}


async function checkIfUserSubscribedToChannel(userId: number, botToken: string, channelUsername: string): Promise<boolean> {
  if (!channelUsername.startsWith('@')) {
    channelUsername = '@' + channelUsername;
  }
  
  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelUsername}&user_id=${userId}`;
  
  try {
    const response = await fetch(url);
    const data: any = await response.json();
    
    if (data.ok && data.result) {
      const status = data.result.status;
      return ['member', 'administrator', 'creator'].includes(status);
    }
    return false;
  } catch (error) {
    console.error('Error checking user subscription to channel:', error);
    return false;
  }
}


async function checkIfUserStartedBot(userId: number, botToken: string): Promise<boolean> {

  const url = `https://api.telegram.org/bot${botToken}/getChat?chat_id=${userId}`;
  
  try {
    const response = await fetch(url);
    const data: any = await response.json();
    
   
    return data.ok === true;
  } catch (error) {
    console.error('Error checking if user started bot:', error);
    return false;
  }
}


function extractEntityUsername(text: string): string {
  const usernameRegex = /@([a-zA-Z0-9_]+)/;
  const match = text.match(usernameRegex);
  return match ? match[1] : '';
}

const router = Router();


router.get('/api/subscription-tasks', async (request, env: Env) => {
  try {
    const tasks = await env.DB.prepare(`
      SELECT t.id, t.text, t.requiredSubscriptionsCount, t.initialSubscriptionsCount,
             COUNT(us.id) as subscriptionsCount
      FROM subscription_tasks t
      LEFT JOIN user_subscriptions us ON t.id = us.taskId
      GROUP BY t.id
      HAVING subscriptionsCount < t.requiredSubscriptionsCount
      LIMIT 3
    `).all();
    
    const response: SubscriptionTaskResponse[] = tasks.results.map((task: any) => ({
      id: task.id,
      text: task.text
    }));
    
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});


router.get('/api/subscriptions/tasks/:id', async (request, env: Env) => {
  try {
    const taskId = parseInt(request.params.id);
    const telegramUserId = parseInt(request.headers.get('X-Telegram-User-Id') || '0');
    
    if (!telegramUserId) {
      return new Response(JSON.stringify({ error: 'User ID not provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    

    const task = await env.DB.prepare(`
      SELECT id, botToken, text, requiredSubscriptionsCount, type, entityUsername
      FROM subscription_tasks 
      WHERE id = ?
    `).bind(taskId).first<SubscriptionTask>();
    
    if (!task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let isSubscribed = false;
    
  
    if (task.type === 'channel') {
     
      isSubscribed = await checkIfUserSubscribedToChannel(
        telegramUserId, 
        task.botToken, 
        task.entityUsername
      );
    } else if (task.type === 'bot') {
     
      isSubscribed = await checkIfUserStartedBot(
        telegramUserId, 
        task.botToken
      );
    }
    
    if (isSubscribed) {
    
      const existingSubscription = await env.DB.prepare(`
        SELECT id FROM user_subscriptions WHERE taskId = ? AND telegramUserId = ?
      `).bind(taskId, telegramUserId).first();

      if (!existingSubscription) {
        await env.DB.prepare(`
          INSERT INTO user_subscriptions (taskId, telegramUserId)
          VALUES (?, ?)
        `).bind(taskId, telegramUserId).run();
      }
    }
    
    return new Response(JSON.stringify({ 
      userSubscribed: isSubscribed 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});


router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-User-Id',
        }
      });
    }
    
 
    const response = await router.handle(request, env);
    const newResponse = new Response(response.body, response);
    

    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-User-Id');
    
    return newResponse;
  }
};