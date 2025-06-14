# Svelte Async Usage Guidelines

::callout{type="info"}
Svelte now supports asynchronous operations using the `await` keyword directly in components. This experimental feature allows for better coordination of async work with minimal ceremony.
::

## Where You Can Use `await`

### 1. Top-level Component Script

```svelte [component.svelte]
<script>
// ✅ Allowed - top-level await in component script
const user = await fetchUser(userId);
const posts = await fetchPosts(user.id);
</script>
```

### 2. Inside $derived Expressions

```svelte [reactive.svelte]
<script>
let userId = $state(1);

// ✅ Allowed - await in $derived
const userData = $derived(await fetchUser(userId));
const userPosts = $derived(await fetchPosts(userData.id));
</script>
```

### 3. Template Expressions

```svelte [template.svelte]
<!-- ✅ Allowed - await in template -->
<h1>Weather forecast for {city}</h1>
<p>{await getWeatherForecast(city)}</p>

<!-- ✅ Allowed - await in attributes -->
<img src={await getImageUrl(imageId)} alt="Dynamic image" />

<!-- ✅ Allowed - await in component props -->
<WeatherWidget forecast={await getWeatherForecast(city)} />

<!-- ✅ Allowed - await in control flow -->
{#if await isUserLoggedIn()}
  <Dashboard />
{:else}
  <LoginForm />
{/if}
```

## Required: Boundary with Pending Snippet

::callout{type="warning"}
All `await` expressions MUST be inside a `<svelte:boundary>` with an optional `pending` snippet
::

```svelte [boundary.svelte]
<!-- ✅ Required boundary setup -->
<svelte:boundary>
  {#snippet pending()}
    <div class="loading">Loading...</div>
  {/snippet}

  {#snippet error(err)}
    <div class="error">Error: {err.message}</div>
  {/snippet}

  <!-- Your async content here -->
  <h1>{await getTitle()}</h1>
  <p>{await getContent()}</p>
</svelte:boundary>
```

## Key Behaviors

### Automatic Coordination

When state changes, UI updates are coordinated - dependent values don't update until async work completes:

```svelte [coordination.svelte]
<script>
let city = $state('London');
</script>

<!-- Both will update together when city changes -->
<h1>Weather forecast for {city}</h1>
<p>{await getWeatherForecast(city)}</p>
```

### Parallel Execution

Multiple await expressions run in parallel by default:

```svelte [parallel.svelte]
<!-- ✅ These run in parallel, not sequentially -->
<div>
  <p>Weather: {await getWeather(city)}</p>
  <p>News: {await getNews(city)}</p>
  <p>Events: {await getEvents(city)}</p>
</div>
```

### Overlapping Updates

New state changes are visible immediately, even during ongoing async work:

```svelte [overlapping.svelte]
<script>
let count = $state(0);

function increment() {
  count++; // ✅ Visible immediately
}
</script>

<!-- Count updates immediately, async work continues -->
<button onclick={increment}>Count: {count}</button>
<p>Slow data: {await getSlowData(count)}</p>
```

## Best Practices

### 1. Use Resource-like APIs for Streaming Updates

::callout{type="tip"}
For cases where you need continuous updates, prefer resource-like patterns
::

```svelte [resource.svelte]
<script>
import { untrack } from 'svelte';

export const createResource = (deps, fetcher, initialValue) => {
  let lastState = initialValue;
  let controller = new AbortController();
  let lastLoading = false;
  let version = $state.raw(0);
  let lastError;
  const derived = $derived.by(() => {
    version;
    for (const dep of deps) {
      $state.snapshot(dep());
    }
    let state = $state.raw(lastState);
    let loading = $state.raw(lastLoading);
    let error = $state.raw(lastError);
    const updater = async () => {
      loading = true;
      lastLoading = true;
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        state = await fetcher(
          deps.map((dep) => dep()),
          signal
        );
        lastState = untrack(() => state);
      } catch (e) {
        loading = false;
        lastLoading = false;
        if (!signal.aborted) {
          error = e;
          lastError = e;
          throw e;
        }
      }
      loading = false;
      lastLoading = false;
    };

    updater();

    return {
      get current() {
        return state;
      },
      get loading() {
        return loading;
      },
      get error() {
        return error;
      }
    };
  });
  return {
    get current() {
      return derived.current;
    },
    get loading() {
      return derived.loading;
    },
    get error() {
      return derived.error;
    },
    refetch() {
      version++;
    }
  };
};

// ✅ Better for streaming/continuous updates
	type Product = {
		title: string
	}

	let search = $state('')
	const productsResource = createResource([() => search], async ([search], signal) => {
		const res = await fetch(`https://dummyjson.com/products/search?q=${search}`, {
			signal,
		})
		const data = await res.json()
		if (signal?.aborted) throw new Error('Aborted')

		return data.products as Product[]
	})
</script>

<input bind:value={search} />

<p>loading: {productsResource.loading}</p>
<p>error: {!!productsResource.error}</p>
<button onclick={productsResource.refetch}>refetch</button>

{#if productsResource.current}
	<ul>
		{#each productsResource.current as product}
			<li>{product.title}</li>
		{/each}
	</ul>
{:else if productsResource.loading}
	<p>Loading...</p>
{:else if productsResource.error}
	<p>Error: {(productsResource.error as Error).message}</p>
	<button onclick={productsResource.refetch}>Retry</button>
{/if}
```

### 2. Break Out of Dependency Graph When Needed

```svelte [independent.svelte]
<script>
let independentValue = $state('');

// ✅ Updates independently of async work
setTimeout(() => {
  independentValue = 'Updated immediately';
}, 0);
</script>
```

### 3. Handle Errors Gracefully

```svelte [error-handling.svelte]
<svelte:boundary>
  {#snippet pending()}
    <LoadingSpinner />
  {/snippet}

  {#snippet error(err)}
    <ErrorMessage message={err.message} />
  {/snippet}

  <!-- Async content -->
</svelte:boundary>
```

### 4. Minimize Async Nesting

```svelte [nesting.svelte]
<!-- ✅ Good - flat structure -->
<div>
  <h1>{await getTitle()}</h1>
  <p>{await getContent()}</p>
</div>

<!-- ❌ Avoid - unnecessary nesting -->
<div>
  {#if await checkCondition()}
    <div>{await getNestedContent()}</div>
  {/if}
</div>
```

## Common Patterns

### Loading States with Fallbacks

```svelte [loading-states.svelte]
<svelte:boundary>
  {#snippet pending()}
    <div class="skeleton">Loading content...</div>
  {/snippet}

  <article>
    <h1>{await getArticleTitle(id)}</h1>
    <div>{await getArticleContent(id)}</div>
  </article>
</svelte:boundary>
```

### Conditional Async Loading

```svelte [conditional.svelte]
<script>
let showDetails = $state(false);
</script>

<button onclick={() => (showDetails = !showDetails)}> Toggle Details </button>

{#if showDetails}
  <svelte:boundary>
    {#snippet pending()}
      <div>Loading details...</div>
    {/snippet}

    <div>{await getDetailedInfo()}</div>
  </svelte:boundary>
{/if}
```

### Form Submission with Async Validation

```svelte [form-validation.svelte]
<script>
let email = $state('');
let isValid = $derived(email ? await validateEmail(email) : false);
</script>

<svelte:boundary>
  {#snippet pending()}
    <div>Validating...</div>
  {/snippet}

  <input bind:value={email} />
  <div class:valid={isValid} class:invalid={!isValid}>
    {isValid ? 'Valid email' : 'Invalid email'}
  </div>
</svelte:boundary>
```

## Important Notes

::callout{type="danger"}
**Experimental Feature Warnings**

- ⚠️ This is experimental and not production-ready
- 🔧 Requires `experimental.async: true` in svelte.config.js
- 🚧 Expect bugs and breaking changes
  ::

## Migration from Existing Patterns

### From {#await} blocks

```svelte [migration-await.svelte]
<!-- ❌ Old way -->
{#await fetchData()}
  <div>Loading...</div>
{:then data}
  <div>{data.title}</div>
{:catch error}
  <div>Error: {error.message}</div>
{/await}

<!-- ✅ New way -->
<svelte:boundary>
  {#snippet pending()}
    <div>Loading...</div>
  {/snippet}

  {#snippet error(err)}
    <div>Error: {err.message}</div>
  {/snippet}

  <div>{await fetchData().title}</div>
</svelte:boundary>
```

### From onMount

```svelte [migration-onmount.svelte]
<!-- ❌ Old way -->
<script>
  import { onMount } from 'svelte';

  let data = $state(null);

  onMount(async () => {
    data = await fetchData();
  });
</script>

<!-- ✅ New way -->
<script>
  const data = await fetchData();
</script>
```

## Reference

::callout{type="info"}
Based on the official [Svelte Async discussion](https://github.com/sveltejs/svelte/discussions/15845) by Rich Harris and the Svelte team.
::
