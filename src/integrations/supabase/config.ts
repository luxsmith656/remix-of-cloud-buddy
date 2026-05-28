export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://cqwjltvdpwqncbjldfvw.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxd2psdHZkcHdxbmNiamxkZnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTUyNzgsImV4cCI6MjA5NTA3MTI3OH0.GAZjltZkwRHDOT-zbqNMOsE3wBxCezUZLfMhx1tWa8Q";
export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
