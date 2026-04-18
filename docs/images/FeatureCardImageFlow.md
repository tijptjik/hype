# Feature Card Image Flow Documentation

This document defines the responsibilities and possible states for image loading flows between components, organized by file/component in the order of data flow.

## Data Flow Chain

**Feature Page** → **ImageProvider** → **ImageCtx** → **UI Components**

Each component manages its own state and passes data/calls to the next component in the chain.

---

## 1. Feature Page (`src/routes/(app)/features/[id]/+page.svelte`)

### **Responsibilities:**

- Detect URL changes and load appropriate feature data
- Manage feature loading state and timing
- Provide consistent props to ImageProvider
- Prevent data mismatches during navigation

### **State Variables:**

- `featureId: string` - Current feature ID from URL params
- `feature: Feature | undefined` - Loaded feature data
- `page` - SvelteKit page store (URL, params, etc.)

### **Derived Values:**

- `imageProviderProps` - Props passed to ImageProvider

### **Functions:**

- `loadFeatureAndSetContext()` - Loads feature data from AppCtx
- Page effect - Triggers feature loading on URL changes

### **Possible States:**

#### **State 1: Initial Load**

- `featureId` = URL param
- `feature` = `undefined`
- `imageProviderProps.isValid` = `false`
- `imageProviderProps.image` = `undefined`
- `imageProviderProps.images` = `undefined`
- `imageProviderProps.context` = `undefined`

#### **State 2: Feature Loaded**

- `featureId` = URL param
- `feature` = loaded Feature object
- `feature.id === featureId` = `true`
- `imageProviderProps.isValid` = `true`
- `imageProviderProps.image` = `feature.image`
- `imageProviderProps.images` = `feature.images`
- `imageProviderProps.context` = valid context with hierarchy

#### **State 3: Navigation in Progress**

- `featureId` = new URL param
- `feature` = old Feature object
- `feature.id === featureId` = `false` (timing mismatch)
- `imageProviderProps.isValid` = `false` (prevented by guard)
- `imageProviderProps.image` = `undefined` (prevented by guard)
- `imageProviderProps.images` = `undefined` (prevented by guard)
- `imageProviderProps.context` = `undefined` (prevented by guard)

#### **State 4: Navigation Complete**

- `featureId` = new URL param
- `feature` = new Feature object
- `feature.id === featureId` = `true`
- `imageProviderProps.isValid` = `true`
- `imageProviderProps` = new feature data

### **Data Passed to ImageProvider:**

```typescript
{
  isAdminMode: false,
  isValid: feature?.id === featureId,
  image: feature?.id === featureId ? (feature.image as Image | null) : undefined,
  images: feature?.id === featureId ? (feature.images as Image[]) : undefined,
  context: feature?.id === featureId && feature
    ? {
        ctxType: ImageContextResource.feature,
        ctxId: featureId,
        ...appCtx.getHierarchySync(feature)
      }
    : undefined,
  page: page
}
```

### **Critical Issues:**

- **Timing Mismatch**: `featureId` updates immediately on URL change, but `feature` loading is async
- **Solution**: Guard with `feature?.id === featureId` check and use `isValid` property

---

## 2. ImageProvider (`src/lib/components/providers/ImageProvider.svelte`)

### **Responsibilities:**

- Detect context changes and coordinate with ImageCtx
- Handle URL-based image targeting (imageId param)
- Manage fullscreen mode state
- Prevent race conditions during navigation

### **Props (from Feature Page):**

- `options: ImageProviderProps` - Feature data and context
- `page` - SvelteKit page store

### **State Variables:**

- `lastSet: string | undefined` - Last context ID that was set
- `lastImageId: string | undefined | null` - Last applied image ID
- `lastImageState: string` - Track image state changes
- `lastFullScreen: boolean | undefined` - Last fullscreen state
- `targetImage: Image | ImageDBBasic | null` - Target image to display
- `initialisingContext: boolean` - Prevents race conditions

### **Derived Values:**

- `urlImageId: string | null` - Image ID from URL params
- `isFullScreen: boolean` - Fullscreen state from URL params

### **Functions:**

- `applyTargetImage(targetImageId)` - Applies target image via ImageCtx
- `getInitialImage()` - Gets initial image based on URL and options
- Effect 1 - Image loading effect
- Effect 2 - Context/target/fullscreen management effect

### **Possible States:**

#### **State 1: Initial Setup**

- `lastSet` = `undefined`
- `targetImage` = `options.image` or loaded from URL
- Context reset triggers

#### **State 2: Stable Context**

- `lastSet` = current `contextId`
- `targetImage` = current feature's image
- No context changes

#### **State 3: Context Change (Navigation)**

- `lastSet` ≠ current `contextId`
- `targetImage` = new feature's image
- Context reset triggers
- `initialisingContext` = `true`

#### **State 4: Image Change (Same Feature)**

- `lastSet` = current `contextId` (unchanged)
- `targetImage` changes to new image
- `applyTargetImage()` called

#### **State 5: Fullscreen Toggle**

- Context and target unchanged
- `isFullScreen` changes
- `imageCtx.setMode()` called

### **Calls to ImageCtx:**

- `imageCtx.setContext(options)` - On context changes
- `imageCtx.target(imageId)` - On image targeting
- `imageCtx.refreshImages(targetImageId)` - When image not in current set
- `imageCtx.setTargetImageId(targetImageId)` - When initializing context
- `imageCtx.setMode(mode)` - On fullscreen changes

### **Critical Issues:**

- **Race Conditions**: Multiple effects running during navigation
- **Solution**: `initialisingContext` flag and proper effect guards
- **Validity Checks**: All operations guarded by `options.isValid`

---

## 3. ImageCtx (`src/lib/context/image.svelte.ts`)

### **Responsibilities:**

- Manage image loading from API
- Handle image state transitions and caching
- Provide image data to UI components
- Coordinate between different image sources

### **State Variables:**

```typescript
state = {
  context: ImageContextConfig | null,
  isFetchingImages: boolean,
  images: SvelteMap<Id, Image>,
  activeImage: Image | null,
  targetImage: Image | null,
  targetImageId: Id | null,
  isTransitioning: boolean
  // ... other state including upload, deletion, status tracking
};
```

### **Key Functions:**

- `setContext(options)` - Main entry point from ImageProvider
- `refreshImages(targetImageId?)` - Loads images from API
- `target(imageId)` - Sets target image for display
- `setActiveImage(image)` - Updates currently displayed image
- `setTargetImageId(imageId)` - Sets target image ID during initialization
- `setMode(mode)` - Handles fullscreen mode changes

### **Possible States:**

#### **State 1: Empty/Initial**

- `context` = `null`
- `images` = empty SvelteMap
- `activeImage` = `null`
- `isFetchingImages` = `false`

#### **State 2: Context Set, Loading Images**

- `context` = new context config
- `images` = empty or stale SvelteMap
- `isFetchingImages` = `true`
- `refreshImages()` in progress

#### **State 3: Images Loaded**

- `context` = current context
- `images` = populated SvelteMap with feature images
- `activeImage` = first/target image
- `isFetchingImages` = `false`

#### **State 4: Targeting Specific Image**

- `targetImageId` = specific image ID
- `refreshImages(targetImageId)` called if image not in current set
- Transitions to target image when available

#### **State 5: Context Change**

- Old context cleared
- New context set
- Images reset and reloaded
- Active image preserved for smooth transitions

### **Image Loading Flow:**

1. `setContext()` called with new context
2. Determines loading strategy based on provided `image`/`images`
3. Case 1: `images` provided → `setImages(images)`
4. Case 2: Single `image` → `setImages([image])` + `refreshImages()`
5. Case 3: No images (`undefined`) → `refreshImages()`
6. Case 4: Null images → Clear state

### **API Integration:**

- `fetchImagesFromCache()` - Tries AppCtx cache first
- `fetchImagesFromAPI()` - Fallback to API call
- `appCtx.setFeatureById()` - Updates cache with API response

### **Critical Issues:**

- **Context Race Conditions**: Multiple `setContext()` calls during navigation
- **Solution**: `currentContextId` tracking and validation
- **Cache Misses**: Feature cache may have `FeatureFromCollection` without images
- **Solution**: API fallback in `fetchImagesFromCache()`

---

## Common Scenarios and Flow

### **Cold Start Navigation**

1. **Page**: URL → `featureId` → `loadFeatureAndSetContext()`
2. **Page**: `feature` loads → `imageProviderProps` updates with `isValid: true`
3. **ImageProvider**: Context change detected → `imageCtx.setContext()`
4. **ImageCtx**: `refreshImages()` → API call → `setImages()` → `setActiveImage()`

### **In-App Navigation**

1. **Page**: URL change → `featureId` updates immediately
2. **Page**: `imageProviderProps` updates with `isValid: false` (prevents mismatch)
3. **ImageProvider**: Context change blocked by validity check
4. **Page**: `loadFeatureAndSetContext()` completes → `imageProviderProps` updates with `isValid: true`
5. **ImageProvider**: Context change → `imageCtx.setContext()`
6. **ImageCtx**: Images load → display

### **Image Parameter Change**

1. **ImageProvider**: `urlImageId` changes → `targetImage` loads
2. **ImageProvider**: Effect detects change → `applyTargetImage()`
3. **ImageCtx**: `target()` → transitions to new image

---

## Debugging Checklist

1. **Page Level**: Does `featureId` match `feature.id` in `imageProviderProps`?
2. **Page Level**: Is `imageProviderProps.isValid` correctly set?
3. **ImageProvider Level**: Is `lastSet` vs `contextId` correct?
4. **ImageProvider Level**: Are operations properly guarded by `options.isValid`?
5. **ImageCtx Level**: Does `currentContextId` match expected context?
6. **Timing**: Are `refreshImages()` calls happening at the right time?
7. **Data Consistency**: Is image data consistent between all components?
