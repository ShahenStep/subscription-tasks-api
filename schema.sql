
CREATE TABLE subscription_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  botToken TEXT NOT NULL,
  text TEXT NOT NULL,
  requiredSubscriptionsCount INTEGER NOT NULL DEFAULT 0,
  initialSubscriptionsCount INTEGER NOT NULL DEFAULT 0
);


CREATE TABLE user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taskId INTEGER NOT NULL,
  telegramUserId INTEGER NOT NULL,
  subscribedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(taskId, telegramUserId),
  FOREIGN KEY (taskId) REFERENCES subscription_tasks(id)
);