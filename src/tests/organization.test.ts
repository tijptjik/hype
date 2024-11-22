import { eq } from 'drizzle-orm';
import { ROUTER_STATE_KEY} from '$lib/context/router.svelte';
import { superValidate } from 'sveltekit-superforms/client';
// TESTING
import { db } from '$lib/db/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import OrganisationPage from '../routes/admin/organisations/[organisation]/+page.svelte';
import FormSubmitButton from '$lib/components/menu/FormSubmitButton.svelte';
// MOCK DATA
import organisationJson from '$lib/db/data/organisations.json';
import organisationI18nJson from '$lib/db/data/organisationsI18n.json';
import userJson from '$lib/db/data/users.json';
// SCHEMA
import { organisation, organisationI18n, organisationRole, user } from '$lib/db/schema';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { OrganisationInsertAPI } from '$lib/db/zod';
// TYPES
import { getContextRef, OrganisationForm } from '$lib/context/forms.svelte';
import { writable } from 'svelte/store';
import { superForm, defaults } from 'sveltekit-superforms';

// TODO Implement tests for organisationForm

describe('Organization Management', () => {
  let testUsers: any[];
  let testOrg: any;

  beforeEach(async () => {
    // Clean up database
    await db.delete(organisationI18n);
    await db.delete(organisationRole);
    await db.delete(organisation);
    await db.delete(user);

    // Create test users
    testUsers = await db.insert(user).values(userJson).returning();
  });

  afterEach(async () => {
    await db.delete(organisationI18n);
    await db.delete(organisationRole);
    await db.delete(organisation);
    await db.delete(user);
  });

  it('should create a new organisation', async () => {
    const newOrgData = organisationJson[0];
    const newOrgI18nData = organisationI18nJson.filter((i18n) => i18n.organisationId === newOrgData.id);
    const [newOrgZHHKData] = newOrgI18nData.filter((i18n) => i18n.lang === 'zh-hant');
    const [newOrgZHSData] = newOrgI18nData.filter((i18n) => i18n.lang === 'zh-hans');

    // Create and initialize the form
    const form = await superValidate(
      {
        id: newOrgData.id,
        userRoles: [
          {
            organisationId: newOrgData.id,
            userId: userJson[0].id,
            role: 'owner',
            user: userJson[0]
          }
        ],
        translations: {
          'zh-hant': { organisationId: newOrgData.id },
          'zh-hans': { organisationId: newOrgData.id }
        }
      },
      zod(OrganisationInsertAPI)
    );

    // Render the page component with new org data
    const { getByRole, getByTestId } = render(OrganisationPage, {
      props: {
        data: {
          validatedForm: form
        }
      },
      context: new Map([
        [
          ROUTER_STATE_KEY,
          {
            resource: 'organisation',
            entity: false,
            facet: false
          }
        ],
        [
          '$page',
          {
            url: new URL('http://localhost:5173/admin/organisations/new')
          }
        ]
      ])
    });

    // Fill in the form fields
    await fireEvent.input(getByTestId('name_en'), {
      target: { value: newOrgData.name }
    });
    await fireEvent.input(getByTestId('name_zh-hant'), {
      target: { value: newOrgZHHKData.name }
    });
    await fireEvent.input(getByTestId('name_zh-hans'), {
      target: { value: newOrgZHSData.name }
    });
    await fireEvent.input(getByTestId('nameShort_en'), {
      target: { value: newOrgData.nameShort }
    });
    await fireEvent.input(getByTestId('nameShort_zh-hant'), {
      target: { value: newOrgZHHKData.nameShort }
    });
    await fireEvent.input(getByTestId('nameShort_zh-hans'), {
      target: { value: newOrgZHSData.nameShort }
    });
    await fireEvent.input(getByTestId('description_en'), {
      target: { value: newOrgData.description }
    });
    await fireEvent.input(getByTestId('description_zh-hant'), {
      target: { value: newOrgZHHKData.description }
    });
    await fireEvent.input(getByTestId('description_zh-hans'), {
      target: { value: newOrgZHSData.description }
    });
    await fireEvent.input(getByTestId('code_core'), {
      target: { value: newOrgData.code }
    });

    // // Render the submit button with proper form context
    // const { getByTestId: getByTestIdFormSubmit } = render(FormSubmitButton, {
    //   props: {
    //     resource: 'organisation',
    //     entity: 'new',
    //     facet: false
    //   },
    //   context: new Map([
    //     [
    //       ROUTER_STATE_KEY,
    //       {
    //         resource: 'organisation',
    //         entity: 'new',
    //         facet: false
    //       }
    //     ],
    //     [
    //       '$page',
    //       {
    //         url: new URL('http://localhost:5173/admin/organisations/new')
    //       }
    //     ]
    //   ])
    // });

    await fireEvent.submit(getByTestId('organisationForm'));

    // Submit the form
    // await fireEvent.click(getByTestIdFormSubmit('formSubmitButton'));

    // Verify the organization was created
    const org = await db
      .select()
      .from(organisation)
    .where(eq(organisation.code, newOrgData.code));
    const orgs = await db.select().from(organisation);
    console.info(orgs);
    expect(org).toBeDefined();
    expect(org?.name).toBe(newOrgData.name);

    // Verify i18n entries were created
    const i18nEntries = await db
      .select()
      .from(organisationI18n)
      .where(eq(organisationI18n.organisationId, org[0].id));
    expect(i18nEntries).toHaveLength(2); // One for zh-hant and one for zh-hans
    
    // Verify the owner role was created
    const roles = await db
      .select()
      .from(organisationRole)
      .where(eq(organisationRole.organisationId, org[0].id));
    expect(roles).toHaveLength(1);
    expect(roles[0].role).toBe('owner');
  });

  it('should modify an existing organisation', async () => {
    // Create initial organization using Ghost Signs data
    const ghostSigns = organisationJson[0];
    testOrg = await db
      .insert(organisation)
      .values({
        id: ghostSigns.id,
        code: ghostSigns.code,
        name: ghostSigns.name,
        nameShort: ghostSigns.nameShort,
        description: ghostSigns.description,
        url: ghostSigns.url,
        image: ghostSigns.image,
        nameGen: false,
        nameShortGen: false,
        descriptionGen: false
      })
      .returning();

    // Modify to match HK Street Names data
    const hkStreetNames = organisationJson[1];
    const updatedOrg = await db
      .update(organisation)
      .set({
        code: hkStreetNames.code,
        name: hkStreetNames.name,
        nameShort: hkStreetNames.nameShort,
        description: hkStreetNames.description,
        url: hkStreetNames.url,
        image: hkStreetNames.image,
        modifiedAt: new Date().toISOString()
      })
      .where(eq(organisation.id, testOrg[0].id))
      .returning();

    expect(updatedOrg[0].name).toBe(hkStreetNames.name);
    expect(updatedOrg[0].nameShort).toBe(hkStreetNames.nameShort);
    expect(updatedOrg[0].description).toBe(hkStreetNames.description);
  });

  it('should add translations to an organisation', async () => {
    // Create initial organization
    const hkdl = organisationJson[2];
    const org = await db
      .insert(organisation)
      .values({
        id: hkdl.id,
        code: hkdl.code,
        name: hkdl.name,
        nameShort: hkdl.nameShort,
        description: hkdl.description,
        url: hkdl.url,
        image: hkdl.image,
        nameGen: false,
        nameShortGen: false,
        descriptionGen: false
      })
      .returning();

    // Add translations
    const translations = await db
      .insert(organisationI18n)
      .values([
        {
          organisationId: org[0].id,
          lang: 'zh-hant',
          name: '香港數據層',
          nameShort: '港數據',
          description: '實用、美觀的香港',
          nameGen: false,
          nameShortGen: false,
          descriptionGen: false
        },
        {
          organisationId: org[0].id,
          lang: 'zh-hans',
          name: '香港数据层',
          nameShort: '港数据',
          description: '实用、美观的香港',
          nameGen: false,
          nameShortGen: false,
          descriptionGen: false
        }
      ])
      .returning();

    expect(translations).toHaveLength(2);
    expect(translations[0].lang).toBe('zh-hant');
    expect(translations[1].lang).toBe('zh-hans');
  });
  it('should add multiple users to an organization', async () => {
    // Create organization using Ghost Signs data
    const ghostSigns = organisationJson[0];
    const org = await db
      .insert(organisation)
      .values({
        id: ghostSigns.id,
        code: ghostSigns.code,
        name: ghostSigns.name,
        nameShort: ghostSigns.nameShort,
        description: ghostSigns.description,
        url: ghostSigns.url,
        image: ghostSigns.image,
        nameGen: false,
        nameShortGen: false,
        descriptionGen: false
      })
      .returning();

    // Add users to organization with different roles
    const orgUsers = await db
      .insert(organisationRole)
      .values([
        { userId: testUsers[0].id, organisationId: org[0].id, role: 'owner' },
        { userId: testUsers[1].id, organisationId: org[0].id, role: 'member' },
        { userId: testUsers[2].id, organisationId: org[0].id, role: 'member' }
      ])
      .returning();

    expect(orgUsers).toHaveLength(3);
    expect(orgUsers[0].role).toBe('owner');
    expect(orgUsers[1].role).toBe('member');
    expect(orgUsers[2].role).toBe('member');
  });

  it('should promote members to owners', async () => {
    // Create organization using HK Street Names data
    const hkStreetNames = organisationJson[1];
    const org = await db
      .insert(organisation)
      .values({
        id: hkStreetNames.id,
        code: hkStreetNames.code,
        name: hkStreetNames.name,
        nameShort: hkStreetNames.nameShort,
        description: hkStreetNames.description,
        url: hkStreetNames.url,
        image: hkStreetNames.image,
        nameGen: false,
        nameShortGen: false,
        descriptionGen: false
      })
      .returning();

    // Add initial users with roles
    await db.insert(organisationRole).values([
      { userId: testUsers[0].id, organisationId: org[0].id, role: 'owner' },
      { userId: testUsers[1].id, organisationId: org[0].id, role: 'member' },
      { userId: testUsers[2].id, organisationId: org[0].id, role: 'member' }
    ]);

    // Promote all members to owners
    const updatedRoles = await db
      .update(organisationRole)
      .set({ role: 'owner' })
      .where(eq(organisationRole.organisationId, org[0].id))
      .returning();

    expect(updatedRoles).toHaveLength(3);
    expect(updatedRoles.every((role) => role.role === 'owner')).toBe(true);
  });

  it('should maintain at least one owner', async () => {
    // Create organization using HKDL data
    const hkdl = organisationJson[2];
    const org = await db
      .insert(organisation)
      .values({
        id: hkdl.id,
        code: hkdl.code,
        name: hkdl.name,
        nameShort: hkdl.nameShort,
        description: hkdl.description,
        url: hkdl.url,
        image: hkdl.image,
        nameGen: false,
        nameShortGen: false,
        descriptionGen: false
      })
      .returning();

    // Add multiple owners
    await db.insert(organisationRole).values([
      { userId: testUsers[0].id, organisationId: org[0].id, role: 'owner' },
      { userId: testUsers[1].id, organisationId: org[0].id, role: 'owner' },
      { userId: testUsers[2].id, organisationId: org[0].id, role: 'owner' }
    ]);

    // Remove all but one owner
    await db.delete(organisationRole).where(eq(organisationRole.userId, testUsers[1].id));
    await db.delete(organisationRole).where(eq(organisationRole.userId, testUsers[2].id));

    // Verify only one owner remains
    const remainingUsers = await db
      .select()
      .from(organisationRole)
      .where(eq(organisationRole.organisationId, org[0].id));

    expect(remainingUsers).toHaveLength(1);
    expect(remainingUsers[0].userId).toBe(testUsers[0].id);
    expect(remainingUsers[0].role).toBe('owner');
  });
});
