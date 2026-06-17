# Navigation Flow and Responsibilities

## Overview

This document outlines the cleaner separation of concerns for navigation state management between different contexts in the application.

## Responsibilities

### `appCtx` (app.svelte.ts)

- **Data Management**: Manages `state.active.collection` and `state.active.feature`
- **Map Operations**: Handles zooming, highlighting, and map-related state
- **Resource Access**: Provides methods to get resources by ID
- **Layer Management**: Manages active layers and prisms

### `omniCtx` (omni.svelte.ts)

- **Navigation Mode**: Manages `state.mode` (search/navigation/feature/new-feature)
- **Card State**: Manages `state.isCardOpen`
- **Search**: Handles search results and search-related UI
- **Initialization**: Provides clean API for setting up navigation context
- **Collection Helpers**: Provides factory methods for creating different collection types

### `featureCardCtx` (card.svelte.ts)

- **Card Display**: Manages card display mode (Display/Missing/AddPhoto/New)
- **Form Data**: Handles form data, validation, and submission state

### 'FeatureCard (Root.svelte)'

- **CardOpen**: Determines whether the card should open

## New Initialization API

### `omniCtx.initNeighbourhood(neighbourhoodRef, options)`

Sets up a neighbourhood-based navigation context:

- Creates neighbourhood collection using `toNeighbourhoodCollection()`
- Sets the active collection on `appCtx`
- Sets mode to 'navigation'
- Activates first feature by default, or specific if provided

```typescript
omniCtx.initNeighbourhood('Central', {
  activeFeatureId: featureId, // Optional: activates specific feature
  focus: true,
  focusFeature: true,
  highlight: true,
  openCard: true
});
```

### `omniCtx.initWalk(walkRef, options, items?, customI18n?)`

Sets up a walk-based navigation context (stars, user collections, etc.):

- Creates walk collection using `toWalkCollection()`
- Handles special cases like 'stars' for wishlisted features
- Sets mode to 'navigation'

```typescript
// Stars collection
omniCtx.initWalk('stars');

// Custom collection
omniCtx.initWalk(
  'userFeatures',
  {
    activeFeatureId: featureId,
    focus: false
  },
  features,
  {
    en: 'My Features',
    zhHant: '我的功能',
    'zhHans': '我的功能'
  }
);
```

### `omniCtx.initFeature(featureId, options)`

Sets up a single-feature navigation context:

- Creates single-feature collection using `toFeatureCollection()`
- Sets active feature on `appCtx`
- Sets mode to 'feature'

```typescript
await omniCtx.initFeature(featureId, {
  focus: true,
  focusFeature: true,
  highlight: true,
  openCard: true
});
```

### `omniCtx.switchToFeatureInCollection(featureId, options)`

Switches to a different feature within the current collection:

- Checks if feature exists in current collection
- Updates active feature
- Handles card state (toggles if same feature selected twice)
- Returns boolean indicating success

```typescript
const success = omniCtx.switchToFeatureInCollection(featureId, {
  openCard: true,
  focus: true
});
```

### `omniCtx.handleFeatureSelection(featureId, options)`

Smart feature selection that determines whether to switch within collection or initialize new:

- If feature is in current collection: calls `switchToFeatureInCollection()`
- Otherwise: calls `initFeature()`
- Handles map click interactions with card state awareness

```typescript
// Used in StandaloneMap.svelte with card state awareness
const isCardAlreadyOpen = omniCtx.state.isCardOpen;
omniCtx.handleFeatureSelection(featureId, {
  focus: !isCardAlreadyOpen // Don't auto-center if card is already open
});
```

## Collection Helper Methods

### `omniCtx.toFeatureCollection(feature)`

Creates a single-feature collection from a feature object:

```typescript
const collection = omniCtx.toFeatureCollection(feature);
```

### `omniCtx.toWalkCollection(walkRef, items, customI18n?)`

Creates a walk collection with proper i18n:

```typescript
// Built-in stars collection
const starsCollection = omniCtx.toWalkCollection('stars', wishlistedFeatures);

// Custom collection
const customCollection = omniCtx.toWalkCollection('myWalk', features, {
  en: 'My Walk',
  zhHant: '我的路線',
  'zhHans': '我的路线'
});
```

### `omniCtx.toNeighbourhoodCollection(neighbourhood, items)`

Creates a neighbourhood collection with localized names:

```typescript
const collection = omniCtx.toNeighbourhoodCollection('Central', features);
```

### `omniCtx.toContributedFeaturesCollection(username, features, projectId, projectName)`

Creates a collection for user-contributed features:

```typescript
const collection = omniCtx.toContributedFeaturesCollection(
  'john_doe',
  features,
  'project123',
  'Hong Kong Ghost Signs'
);
```

## Helper State Check Methods

- `omniCtx.isCollectionInitialized(collectionId)`: Check if specific collection is active
- `omniCtx.isFeatureInitialized(featureId)`: Check if specific feature is active
- `omniCtx.isFeatureInCollection(featureId)`: Check if feature exists in current collection
- `omniCtx.isColdStart(featureId)`: Check if page represents a cold start

## Standard Option Parameters

### Full Options (init methods)

```typescript
{
  activeFeatureId?: string;  // Specific feature to activate
  focus: boolean;           // Whether to center map on collection/feature
  focusFeature: boolean;    // Whether to focus on specific feature
  highlight: boolean;       // Whether to highlight feature
  openCard: boolean;        // Whether to open feature card
}
```

### Simplified Options (switch methods)

```typescript
{
  openCard?: boolean;       // Whether to open feature card
  openCardDelay?: number;   // Delay before opening card
  focus?: boolean;          // Whether to center map on feature
  navOptions?: Record<string, any>; // Navigation options
}
```

## Flow Examples

### Feature Page Load (`+page.svelte`)

```typescript
if (!isClosing && omniCtx.isColdStart(featureId)) {
  // Cold start: initialize the feature
  await omniCtx.initFeature(featureId, {
    focus: false, // Let FeaturePortal handle animation
    focusFeature: false,
    highlight: true,
    openCard: true
  });
} else if (!isClosing && !omniCtx.isFeatureInitialized(featureId)) {
  // Try to switch within existing collection
  const success = omniCtx.switchToFeatureInCollection(featureId, {
    openCard: true,
    focus: false // Let FeaturePortal handle animation
  });

  if (!success) {
    // Fallback: initialize as single feature
    await omniCtx.initFeature(featureId, {
      focus: false,
      focusFeature: false,
      highlight: true,
      openCard: true
    });
  }
}
```

### Contributed Features Navigation

```typescript
// Check if we can switch within current collection
const expectedCollectionId = `${username}${projectId}Features`;
if (omniCtx.isCollectionInitialized(expectedCollectionId)) {
  const success = omniCtx.switchToFeatureInCollection(featureId);
  if (success) return;
}

// Initialize new contributed features collection
const collection = omniCtx.toContributedFeaturesCollection(
  username,
  features,
  projectId,
  projectName
);
omniCtx.initWalk(
  `${username}${projectId}Features`,
  {
    activeFeatureId: featureId,
    focus: true,
    focusFeature: true,
    highlight: true,
    openCard: true
  },
  features,
  {
    en: `${projectName} by ${username}`,
    zhHant: `貢獻者 ${username}`,
    'zhHans': `贡献者 ${username}`
  }
);
```

### Map Click Handling

```typescript
// In StandaloneMap.svelte - smart card state awareness
const isCardAlreadyOpen = omniCtx.state.isCardOpen;
omniCtx.handleFeatureSelection(featureId, {
  focus: !isCardAlreadyOpen // Don't auto-center if card open (let FeaturePortal animate)
});
```

## Benefits

1. **Clear Separation**: Each context has well-defined responsibilities
2. **Smart Defaults**: Options have sensible defaults with override capability
3. **Animation Coordination**: Map centering is disabled when card is open to allow FeaturePortal animations
4. **Collection Factories**: Helper methods ensure consistent i18n and structure
5. **State Awareness**: Methods understand current context and make smart decisions
6. **Reusable API**: Same patterns work for different navigation scenarios

## Navigation Bar Visibility

The `OmniNavigationBar.svelte` will be visible when:

- `omniCtx.state.mode === 'navigation'` (collection mode)
- AND `appCtx.state.active.collection` exists

The title comes from the active collection's i18n data via `omniCtx.navTitle`.

## Mode Transitions

- **search** → **navigation**: When selecting neighbourhood/walk collections
- **search** → **feature**: When selecting single features
- **navigation** → **feature**: When switching from collection to single feature mode
- **feature** → **navigation**: When initializing collections from feature context
- **any** → **search**: Via `omniCtx.resetToSearch()` or `omniCtx.close()`
