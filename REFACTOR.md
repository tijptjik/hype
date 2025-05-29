# Refactoring

## i18n

- [ ] unify getters and setters for en with i18n options.
- [x] replace languageTag with locale
- [x] replace TargetLocale with Locale
- [x] refactor use of SourceLocale
- [x] refactor use of TargetLocale

## zod schema

- [ ] Test the refactored schemas and types:
  - [x] Test organisation
  - [x] Test project
  - [x] Test layer
  - [x] Test feauture
  - [ ] Test image
  - [ ] Test task
  - [ ] Test property
  - [ ] Test user

- [ ] Test the refactored types:
  - [x] Test organisation
  - [x] Test project
  - [x] Test layer
  - [x] Test feauture
  - [ ] Test image
  - [ ] Test task
  - [ ] Test property
  - [ ] Test user

## crud

- [x] Remove updatePartial
- [x] Remove createTranslations
- [x] Remove updateTranslations
- [ ] Remove patchLayer, PatchFeature, PatchOrganisation, PatchTask, PatchProject
- [ ] Remove extractEntitiesToInsert - this should all be handled by orchestration functions
- [ ] Remove extractEntitiesToUpdate - this should all be handled by orchestration functions

## access controls

- [x] publicAccessOptions
- [x] relationalAccessOptions
- [x] applyGenericAccessStrategy
- [x] applyAccessStrategy
- [x] applyTranslationCondition
- [x] applyQueryConstraints
- [ ] genericResourceQuery
- [ ] hierarchicalResourceQuery
- [ ] genericEntityQuery 
- [ ] hierarchicalResourceQuery
- [ ] getDatabaseOrError
- [x] isAdminView