export type TrainingRating = {
  training_id: string;
  average_rating: number | null;
  rating_count: number;
};
export type RatingOverview = {
  average_rating: number | null;
  rating_count: number;
  rated_trainings: number;
};
export type RatingViewer = {
  status: "ready" | "unauthenticated" | "inactive" | "unavailable";
  rating: number | null;
};
export type TrainingRecord = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  video_url: string | null;
  video_storage_path: string | null;
  cover_path: string | null;
  publication_status: "draft" | "published" | "archived";
  created_at: string;
};
