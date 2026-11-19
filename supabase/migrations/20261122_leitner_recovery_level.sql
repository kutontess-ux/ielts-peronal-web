-- Migration: Bổ sung cơ chế phục hồi cấp độ Leitner (recovery_level)
-- Khi trả lời sai ở Level k (k >= 2), từ tụt về Level 1 nhưng lưu recovery_level = k - 1.
-- Nếu lần ôn lại tiếp theo trả lời đúng, từ phục hồi về recovery_level và xóa recovery_level.

alter table public.reviews
  add column if not exists recovery_level smallint null check (recovery_level between 1 and 5);
