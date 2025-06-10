# Refactor

## Svelte

- [ ] use [@attach](https://svelte.dev/docs/svelte/@attach) to replace Svelte Actions.
- [ ] use [<svelte:boundary>](https://svelte.dev/docs/svelte/svelte-boundary)
- [x] debug with [@debug](https://svelte.dev/docs/svelte/@debug)

### BitsUI

- [ ] Replace the existing components in favour of [BitsUI](https://bits-ui.com/docs/introduction)
- [ ] Drop DaisyUI.

### Runed

Use the `runed` library - [runed.dev](https://runed.dev/)

- [ ] use [useGeolocation](https://runed.dev/docs/utilities/use-geolocation)
- [ ] use [onClickOutside](https://runed.dev/docs/utilities/on-click-outside)
- [ ] use [TextareaAutosize](https://runed.dev/docs/utilities/textarea-autosize)
- [ ] use [previous](https://runed.dev/docs/utilities/previous)
- [ ] use [debounced](https://runed.dev/docs/utilities/debounced)
- [ ] use [watch](https://runed.dev/docs/utilities/watch)
- [ ] use [resource](https://runed.dev/docs/utilities/resource)

## Typescript

### Documentation

- use [@component](https://svelte.dev/docs/svelte/faq#How-do-I-document-my-components) to document components

## i18n

- [x] unify getters and setters for en with i18n options.
- [x] replace languageTag with locale
- [x] replace TargetLocale with Locale
- [x] refactor use of SourceLocale
- [x] refactor use of TargetLocale

## zod schema

- [x] Test the refactored schemas and types:
  - [x] Test organisation
  - [x] Test project
  - [x] Test layer
  - [x] Test feauture
  - [x] Test image
  - [x] Test task
  - [x] Test property
  - [x] Test user
  - [x] Test userFeatures

## REST

- [x] Test the refactored HTTP endpoints:
  - [x] Test organisation
  - [x] Test project
  - [x] Test layer
  - [x] Test feauture
  - [x] Test image
  - [x] Test task
  - [x] Test property
  - [x] Test user
  - [x] Test userFeatures

## crud

- [x] Remove updatePartial
- [x] Remove createTranslations
- [x] Remove updateTranslations
- [x] Remove patchLayer, PatchFeature, PatchOrganisation, PatchTask, PatchProject
- [x] Remove extractEntitiesToInsert - this should all be handled by orchestration functions
- [x] Remove extractEntitiesToUpdate - this should all be handled by orchestration functions

## access controls

- [x] publicAccessOptions
- [x] relationalAccessOptions
- [x] applyGenericAccessStrategy
- [x] applyAccessStrategy
- [x] applyTranslationCondition
- [x] applyQueryConstraints
- [x] genericResourceQuery
- [x] hierarchicalResourceQuery
- [x] genericEntityQuery
- [x] getDatabaseOrError
- [x] isAdminView
