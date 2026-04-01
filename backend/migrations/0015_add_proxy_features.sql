ALTER TABLE `users` ADD COLUMN proxy_uuid text;
CREATE UNIQUE INDEX IF NOT EXISTS `users_proxy_uuid_unique` ON `users` (proxy_uuid);

ALTER TABLE `chat_sessions` ADD COLUMN proxy_for_user_id text REFERENCES `users`(`id`) ON DELETE set null;

ALTER TABLE `tasks` ADD COLUMN session_id text REFERENCES `chat_sessions`(`id`) ON DELETE set null;
