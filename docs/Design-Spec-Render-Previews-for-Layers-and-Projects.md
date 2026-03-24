

3. Build the effective layer render payload.
   Add a server-side resolver that takes `layerId` and returns the exact map composition used for preview rendering. This should include inherited/default style choices and anything else that affects pixels.

4. Add hash generation for layer previews.
   Serialize the resolved payload in a stable way and hash that. The hash should change only when the visual output can change.

5. Add a dedicated headless preview route.
   Create something like `/headless/map-layer-preview/[layerId]` that renders only the deterministic preview surface, no app chrome, and emits the same ready marker used by the current `mapRender/styles` renderer flow.

6. Extend the queue job builder for layers.
   Add a layer-specific job builder that:
   - computes the layer preview hash
   - builds the headless render URL using `PUBLIC_ORIGIN`
   - writes object keys as `mapRender/layers/{layerId}/{hash}.png`
   - fits under the `api/mapPreviews` namespace, where `mapRender/styles` backs the built-in style previews

7. Add enqueue points on layer mutations.
   After successful persistence of layer style/composition changes:
   - compute the new hash
   - no-op if unchanged
   - otherwise enqueue a new preview job
   - keep old preview visible until the new one finishes

8. Update the renderer worker for layer jobs.
   The worker already accepts `kind: 'layers'`, but it should gain explicit logging/validation for layer renders and any future branching if route/query construction diverges.

9. Persist completion/failure state.
   Add a callback or follow-up write path so completed renders update the layer row with URL/hash/generated timestamp, and failures set `previewStatus='failed'` plus error details.

10. Wire the UI to preview metadata.
   Update layer cards/forms/admin lists to read preview state from DB:
   - show current preview image when available
   - show pending/failed states explicitly
   - do not depend on repo-static assets for layers

11. Add tests at three levels.
   - unit tests for stable hash generation
   - unit/integration tests for object key + render URL construction
   - route/consumer tests for headless readiness and queue payload handling

12. Only after layers, repeat the same pattern for projects.
   Projects should reuse the same preview-state model and pipeline, with a different effective render-payload resolver and object key namespace, likely under `api/mapPreviews/project/[project]`.

When you want to start, I’d begin with steps 2 through 6 together so we get one thin end-to-end vertical slice before touching the mutation flows.
