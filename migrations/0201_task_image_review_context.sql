-- Reviewer-owned image snapshots remain separate from immutable submitted candidates.
ALTER TABLE featureRevisionReview ADD COLUMN context TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(context));
CREATE INDEX feature_review_image_context ON featureRevisionReview(proposalId)
  WHERE json_extract(context,'$.kind')='image-review/v1';
