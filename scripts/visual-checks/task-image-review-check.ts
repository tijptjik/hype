import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const output = 'output/playwright/task-image-review'
await mkdir(output, { recursive: true })
const mock = `
const entry = {imageRevisionId:'original',intent:'undefined',isPublished:true,caption:{en:''},alt:{}};
let review = {taskId:'task',proposalId:'proposal',proposalVersion:'v1',featureId:location.search.includes('photo')?'feature':null,reviewId:null,comparedRevisionId:null,currentRevisionId:null,currentGeneration:0,status:'submitted',stale:false,initialProposal:true,excluded:[],
 content:{gallery:{order:['photo'],entries:{photo:structuredClone(entry)}}},submitted:{gallery:{order:['photo'],entries:{photo:structuredClone(entry)}}},images:{photo:{contributorId:'photographer',createdAt:'2026-11-01T12:00:00Z',metadata:{cameraModel:'Review camera',originalWidth:900,originalHeight:600,renderRotation:0,presentationMode:'contain'},originalMetadata:{cameraModel:'Original camera',originalWidth:900,originalHeight:600,renderRotation:0,presentationMode:'contain'},originalRevisionId:'original'}}};
if(location.search.includes('multi') || location.search.includes('context')) {
 for(const gallery of [review.content.gallery,review.submitted.gallery]) { gallery.order.push('second');gallery.entries.second=structuredClone(entry) }
 review.images.second=structuredClone(review.images.photo);
}
if(location.search.includes('manual') || location.search.includes('completed') || location.search.includes('outcome')) {review.content.gallery.sortMode='manual'}
if(location.search.includes('context')) {review.imageIds=['photo'];review.content.gallery.entries.second.intent='canonical'}
if(location.search.includes('exclusive')) {review.content.gallery.entries.photo.intent='general';review.content.gallery.entries.second.intent='canonical'}
if(location.search.includes('stale')) review.stale=true;
if(location.search.includes('completed')) review.status='accepted';
const reviews=[review];
if(location.search.includes('proposals')) {
 review.imageIds=['photo'];
 const second=structuredClone(review);second.proposalId='proposal-two';second.proposalVersion='v2';second.imageIds=['other'];
 for(const gallery of [second.content.gallery,second.submitted.gallery]) {gallery.order=['other'];gallery.entries={other:structuredClone(entry)}}
 second.images={other:structuredClone(review.images.photo)};reviews.push(second);
}
globalThis.reviewCalls=[];
export async function getTaskImageReviews(){if(location.search.includes('pending')) await new Promise(resolve=>{globalThis.releaseInitialReview=resolve});return structuredClone(reviews)}
export async function saveTaskImageReview(input){
 review=reviews.find(row=>row.proposalId===input.proposalId);
 if(globalThis.holdReview)await new Promise(resolve=>{globalThis.releaseReview=()=>{globalThis.holdReview=false;resolve()}});
 if(globalThis.failNextReview){globalThis.failNextReview=false;throw {status:409,body:{message:'Review changed; refresh before saving'}}}
 if(input.expectedReviewId!==review.reviewId)throw Error('Stale review');
 globalThis.reviewCalls.push(input);
 review.reviewId='review-'+globalThis.reviewCalls.length;
 const p=input.patch,e=review.content.gallery.entries[p.imageId];
 if(p.rotation!==undefined){review.images.photo.metadata.renderRotation=p.rotation;e.imageRevisionId=review.reviewId}
 if(p.presentationMode)review.images.photo.metadata.presentationMode=p.presentationMode;
 if(p.intent){e.intent=p.intent;if(p.intent==='canonical')for(const [id,other] of Object.entries(review.content.gallery.entries))if(id!==p.imageId&&other.intent==='canonical')other.intent='general'} if(p.caption)e.caption=p.caption;if(p.alt)e.alt=p.alt;
 if(p.included!==undefined)review.excluded=p.included?[]:['photo'];
 return structuredClone(review);
}
export async function replaceTaskReviewImage(input){return saveTaskImageReview(input)}
export async function acceptTaskImageReview(input){globalThis.acceptInput=input;review.status='accepted';return {status:'accepted'}}
`
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } }),
        errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/__task-image-review.html*', r =>
        r.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/taskImageReviewCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/taskImageReview.remote.*', r =>
        r.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.route('**/src/lib/api/image.remote.*', r =>
        r.fulfill({
          contentType: 'application/javascript',
          body: `export async function getImagesForContext(){return null};export async function getImagesForContextByProfile(){return null};export async function getImagesForIds(){return null};export async function getImagesForIdsByProfile(){return null};export async function getFeatureCanonicalImageOccupancy(){return null};export async function getImageById(){return null};export async function getImageByIdByProfile(){return null};export async function getMetadata(){return null};export async function authImageUpload(){return null};export async function finalizeImageUpload(){return null};export async function createImage(){return null};export async function updateImage(){return null};export async function setImageIntent(){return null};export async function setImagePublished(){return null};export async function rotateImage(){return null};export async function deleteImage(){return null};export async function getImageIntentOptions(){return {intents:[{id:'undefined',label:'Unclassified',isPublished:false},{id:'general',label:'General',isPublished:true},{id:'canonical',label:'Featured',isPublished:true}]}}`,
        }),
      )
      await page.route('**/src/lib/api/user.remote.*', r =>
        r.fulfill({
          contentType: 'application/javascript',
          body: `export async function searchUsers(){return null};export async function getAdminUserProfile(){return null};export async function getUserContributionPreviews(){return null};export async function getUserContributedFeatures(){return null};export async function getUserContributedImages(){return null};export async function getUserDirectoryMetrics(){return null};export async function getUser(){return null};export async function updateUserProfile(){return null};export async function getUserLayers(){return null};export async function setUserLayerDefaults(){return null};export async function getUserFeatures(){return null};export async function addUserFeatureToList(){return null};export async function removeUserFeatureFromList(){return null};export async function getUserForAttribution(){return {id:'photographer',name:'Photo Contributor',attribution:'Photo Contributor',username:'photographer',image:null}}`,
        }),
      )
      await page.route('**/api/images/revisions/**', r =>
        r.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#698675"/><text x="90" y="120" font-size="50" fill="white">Submitted image</text></svg>',
        }),
      )
      // Intent persistence locks sorting without removing its manual-order control or shifting the rail.
      for (const fail of [false, true]) {
        await page.goto(base + '/__task-image-review.html?photo&multi&manual')
        const sort = page.getByRole('button', {
          name: 'Automatic image sorting',
          exact: true,
        })
        await sort.waitFor()
        await page.locator('[data-review-busy="false"]').waitFor()
        await sort.evaluate(async node => {
          for (let parent: Element | null = node; parent; parent = parent.parentElement)
            await Promise.all(
              parent.getAnimations().map(animation => animation.finished),
            )
        })
        const before = await sort.boundingBox()
        const order = await page
          .locator('[data-gallery-thumb-id]')
          .evaluateAll(nodes =>
            nodes.map(node => node.getAttribute('data-gallery-thumb-id')),
          )
        await page.evaluate(fail => {
          ;(globalThis as any).holdReview = true
          ;(globalThis as any).failNextReview = fail
        }, fail)
        await page
          .locator('[data-image-editor-viewport]')
          .getByRole('button', { name: 'Change image intent', exact: true })
          .click()
        await page.getByRole('button', { name: 'General', exact: true }).click()
        await page.waitForFunction(() => (globalThis as any).releaseReview)
        const labels = page.getByRole('button', {
          name: 'Change image intent',
          exact: true,
        })
        if (
          (await labels.count()) !== 3 ||
          (await labels.filter({ hasText: 'General' }).count()) !== 2 ||
          (await labels.filter({ hasText: 'Unclassified' }).count()) !== 1
        )
          throw Error(
            'Intent save removed labels or lost optimistic/unchanged values: ' +
              JSON.stringify(await labels.allTextContents()),
          )
        if (
          await labels.evaluateAll(nodes =>
            nodes.some(node => !(node as HTMLButtonElement).disabled),
          )
        )
          throw Error('Pending intent controls allow another save')
        if (!(await sort.isVisible()) || !(await sort.isDisabled()))
          throw Error('Saving intent removed or enabled manual sorting')
        if (JSON.stringify(await sort.boundingBox()) !== JSON.stringify(before))
          throw Error(
            'Intent save shifted the sorting rail: ' +
              JSON.stringify({ before, after: await sort.boundingBox() }),
          )
        await page.evaluate(() => (globalThis as any).releaseReview())
        await page.locator('[data-review-busy="false"]').waitFor()
        if (
          (await labels.filter({ hasText: 'General' }).count()) !== (fail ? 0 : 2) ||
          (await labels.filter({ hasText: 'Unclassified' }).count()) !== (fail ? 3 : 1)
        )
          throw Error('Intent values did not reconcile or roll back')
        if (
          !(await sort.isVisible()) ||
          (await sort.isDisabled()) ||
          (await sort.getAttribute('aria-pressed')) !== 'false'
        )
          throw Error('Intent save changed manual sorting state')
        if (
          JSON.stringify(
            await page
              .locator('[data-gallery-thumb-id]')
              .evaluateAll(nodes =>
                nodes.map(node => node.getAttribute('data-gallery-thumb-id')),
              ),
          ) !== JSON.stringify(order)
        )
          throw Error('Intent change reordered a manual gallery')
      }
      if (process.env.TASK_SORT_STABILITY_ONLY) {
        for (const scenario of ['completed', 'outcome', 'stale']) {
          await page.goto(
            base + '/__task-image-review.html?photo&multi&manual&' + scenario,
          )
          await page.locator('[data-image-editor-viewport]').waitFor()
          await page.locator('[data-review-busy="false"]').waitFor()
          if (
            await page
              .getByRole('button', { name: 'Automatic image sorting', exact: true })
              .count()
          )
            throw Error('Non-editable review exposes sorting: ' + scenario)
        }
        console.log(name, width, 'sort stability and read-only visibility passed')
        await page.close()
        continue
      }
      await page.goto(base + '/__task-image-review.html?photo&context&pending')
      await page.locator('[data-task-image-loading]').waitFor()
      if (await page.getByText('Select images', { exact: true }).count())
        throw Error('Upload prompt appeared while review was loading')
      const pendingViewport = await page
        .locator('[data-image-editor-viewport]')
        .boundingBox()
      await page.waitForFunction(() => (globalThis as any).releaseInitialReview)
      await page.evaluate(() => (globalThis as any).releaseInitialReview())
      await page.locator('[data-gallery-thumb-id="second"]').waitFor()
      const readyViewport = await page
        .locator('[data-image-editor-viewport]')
        .boundingBox()
      if (
        !pendingViewport ||
        !readyViewport ||
        Math.abs(pendingViewport.width - readyViewport.width) > 1 ||
        Math.abs(pendingViewport.height - readyViewport.height) > 1
      )
        throw Error('Review evidence loading shifted the reserved image viewport')
      if (process.env.TASK_LOADING_ONLY) {
        if (errors.length) throw Error(errors.join('\n'))
        console.log(
          name,
          width,
          'pending image review preserved its viewport and thumbnail rail',
        )
        await page.close()
        continue
      }
      if (!process.env.TASK_EXISTING_INTENT_ONLY) {
        // Hold the response to verify exclusive Featured intent and rollback in the rendered editor.
        for (const fail of [true, false]) {
          await page.goto(base + '/__task-image-review.html?multi&exclusive')
          const controls = page.getByRole('button', {
            name: 'Change image intent',
            exact: true,
          })
          await controls.last().waitFor({ timeout: 45000 })
          await page.locator('[data-review-busy="false"]').waitFor()
          await page.evaluate(fail => {
            ;(globalThis as any).holdReview = true
            ;(globalThis as any).failNextReview = fail
          }, fail)
          await controls.filter({ hasText: 'General' }).last().click()
          await page.getByRole('button', { name: 'Featured', exact: true }).click()
          await page.waitForFunction(() => (globalThis as any).releaseReview)
          if (
            (await controls.filter({ hasText: 'Featured' }).count()) !== 2 ||
            (await controls.filter({ hasText: 'General' }).count()) !== 1
          )
            throw Error(
              'Featured replacement did not optimistically demote the previous image: ' +
                JSON.stringify({
                  controls: await controls.allTextContents(),
                  errors,
                  body: await page.locator('body').innerText(),
                }),
            )
          await page.evaluate(() => (globalThis as any).releaseReview())
          await page.locator('[data-review-busy="false"]').waitFor()
          if (
            (await controls.filter({ hasText: 'Featured' }).count()) !==
              (fail ? 1 : 2) ||
            (await controls.filter({ hasText: 'General' }).count()) !== (fail ? 2 : 1)
          )
            throw Error(
              'Featured replacement did not reconcile or roll back both images',
            )
        }
        if (process.env.TASK_INTENT_STABILITY_ONLY) {
          console.log(name, width, 'optimistic intent and rollback passed')
          await page.close()
          continue
        }
        await page.goto(base + '/__task-image-review.html?multi')
        const intentButtons = page.getByRole('button', {
          name: 'Change image intent',
          exact: true,
        })
        const intent = intentButtons.last()
        await intent.waitFor({ timeout: 45000 })
        await page
          .getByText('Photo Contributor', { exact: true })
          .first()
          .waitFor({ state: 'attached' })
        const metadataButton = page.getByRole('button', { name: /metadata/i })
        await metadataButton.click()
        await page.getByText('Review camera', { exact: true }).waitFor()
        await metadataButton.click()
        if (
          await page
            .getByRole('button', {
              name: /Show original|Remove image from report|Restore image to report/,
            })
            .count()
        )
          throw Error('Removed actions remain')
        if (
          await page
            .getByRole('button', { name: /Replace image|Download raw image/ })
            .isVisible()
            .catch(() => false)
        )
          throw Error('Overflow actions visible before opening edit menu')
        await page.evaluate(() => {
          const native = document.startViewTransition?.bind(document)
          ;(globalThis as any).menuTransitions = 0
          if (native)
            document.startViewTransition = ((update: any) => {
              ;(globalThis as any).menuTransitions++
              return native(update)
            }) as typeof document.startViewTransition
        })
        const presentation = page.getByRole('button', { name: /^Image presentation:/ })
        await presentation.click()
        await page.getByRole('menuitemradio').first().waitFor()
        await page.waitForFunction(
          () => !document.documentElement.hasAttribute('data-review-transition'),
        )
        await page.getByRole('menuitemradio').first().press('Escape')
        await page.getByRole('menuitemradio').first().waitFor({ state: 'hidden' })
        // Intent popovers stay live: document snapshots can obscure them beneath the parent dialog.
        const intentTransitionCount = await page.evaluate(
          () => (globalThis as any).menuTransitions,
        )
        await intent.click()
        await page.getByRole('button', { name: 'General', exact: true }).waitFor()
        if (
          (await page.evaluate(() => (globalThis as any).menuTransitions)) !==
          intentTransitionCount
        )
          throw Error('Opening intent captured the surrounding dialog')
        await page.evaluate(() => {
          ;(globalThis as any).holdReview = true
        })
        await page.getByRole('button', { name: 'General', exact: true }).click()
        await page.waitForFunction(() => (globalThis as any).releaseReview)
        if ((await intentButtons.filter({ hasText: 'General' }).count()) !== 2)
          throw Error('Intent did not update both toolbar and thumbnail before saving')
        if ((await page.evaluate(() => (globalThis as any).reviewCalls.length)) !== 0)
          throw Error('Optimism check did not hold the server response')
        await page.evaluate(() => (globalThis as any).releaseReview())
        await page.waitForFunction(() => (globalThis as any).reviewCalls.length === 1)
        await page.locator('[data-review-busy="false"]').waitFor()
        await intent.click()
        await page.evaluate(() => {
          ;(globalThis as any).holdReview = true
          ;(globalThis as any).releaseReview = null
          ;(globalThis as any).failNextReview = true
        })
        await page.getByRole('button', { name: 'Unclassified', exact: true }).click()
        await page.waitForFunction(() => (globalThis as any).releaseReview)
        if ((await intentButtons.filter({ hasText: 'Unclassified' }).count()) !== 3)
          throw Error('Second optimistic intent did not reach both controls')
        await page.evaluate(() => (globalThis as any).releaseReview())
        await page
          .getByRole('status')
          .filter({ hasText: 'Review changed; refresh before saving' })
          .waitFor()
        if ((await intentButtons.filter({ hasText: 'General' }).count()) !== 2)
          throw Error('Failed intent did not restore both controls')
        const transitions = await page.evaluate(() => ({
          supported: Boolean(document.startViewTransition),
          count: (globalThis as any).menuTransitions,
        }))
        if (transitions.supported && transitions.count !== intentTransitionCount)
          throw Error('Intent menu changes captured the surrounding dialog')
        await page.getByRole('button', { name: 'Edit image text', exact: true }).click()
        await page.getByRole('textbox', { name: /^Caption ·/ }).fill('Reviewed caption')
        await page.waitForFunction(
          () =>
            !document
              .querySelector('[role=dialog]')
              ?.getAttribute('style')
              ?.includes('view-transition-name'),
        )
        const viewport = await page
          .locator('[data-image-editor-viewport]')
          .boundingBox()
        const overlay = await page.locator('.bits-dialog__overlay').boundingBox()
        const dialog = await page.getByRole('dialog').boundingBox()
        if (!viewport || !overlay || !dialog)
          throw Error('Missing image dialog geometry')
        for (const key of ['x', 'y', 'width', 'height'] as const)
          if (Math.abs(viewport[key] - overlay[key]) > 1)
            throw Error('Scrim extends outside the image')
        if (
          Math.abs(dialog.x + dialog.width / 2 - viewport.x - viewport.width / 2) > 1 ||
          Math.abs(dialog.y + dialog.height / 2 - viewport.y - viewport.height / 2) > 1
        ) {
          await page.screenshot({
            path: output + '/dialog-geometry-failure.png',
            fullPage: true,
          })
          throw Error(
            'Dialog is not centered on the image: ' +
              JSON.stringify({
                viewport,
                overlay,
                dialog,
                style: await page.getByRole('dialog').getAttribute('style'),
              }),
          )
        }
        await page.screenshot({
          path: output + '/' + name + '-' + width + '-scoped-dialog.png',
          fullPage: true,
        })
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Save', exact: true })
          .click()
        await page.waitForFunction(() => (globalThis as any).reviewCalls.length === 2)
        await page.locator('[data-review-busy="false"]').waitFor()
        await page
          .getByRole('button', { name: 'Show image edit controls', exact: true })
          .click()
        const right = page.getByRole('button', {
          name: 'Rotate image right',
          exact: true,
        })
        await page.clock.install()
        await page.clock.pauseAt(new Date())
        await right.click()
        await page.clock.runFor(500)
        await right.click()
        for (let turn = 0; turn < 3; turn++) {
          await page.clock.runFor(100)
          await right.click()
        }
        await page.clock.runFor(749)
        if (!(await page.locator('[style*="rotate(450deg)"]').count()))
          throw Error('Preview wrapped instead of continuing through a full turn')
        if ((await page.evaluate(() => (globalThis as any).reviewCalls.length)) !== 2)
          throw Error('Rotation saved before debounce elapsed')
        await page.clock.runFor(1)
        await page.waitForFunction(() => (globalThis as any).reviewCalls.length === 3)
        const rotation = await page.evaluate(
          () => (globalThis as any).reviewCalls[2].patch.rotation,
        )
        if (rotation !== 90) throw Error('Rotation clicks did not accumulate')
        await page.locator('[data-review-busy="false"]').waitFor()
        if (!(await right.isVisible())) throw Error('Rotation collapsed the edit menu')
        await page.screenshot({
          path: output + '/' + name + '-' + width + '-toolbar.png',
          fullPage: true,
        })
        if (
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        )
          throw Error('Horizontal overflow')
        if (errors.length) throw Error(errors.join('\n'))
        await page.clock.resume()
        await page.goto(base + '/__task-image-review.html?photo')
        const accept = page.getByRole('button', { name: 'Accept All', exact: true })
        await page.waitForFunction(() =>
          document.querySelector('header button')?.matches(':enabled'),
        )
        if (
          await page
            .getByRole('button', { name: 'Accept reviewed photos', exact: true })
            .count()
        )
          throw Error('Duplicate acceptance remains')
        const photoIntent = page
          .locator('[data-image-editor-viewport]')
          .getByRole('button', { name: 'Change image intent', exact: true })
        const intentColor = await photoIntent.evaluate(
          element => getComputedStyle(element).color,
        )
        await photoIntent.click()
        await page.getByRole('button', { name: 'Featured', exact: true }).click()
        await page.waitForFunction(() => (globalThis as any).reviewCalls.length === 1)
        await page.locator('[data-review-busy="false"]').waitFor()
        await page.waitForFunction(
          () => !document.documentElement.hasAttribute('data-review-transition'),
        )
        await page
          .getByRole('button', { name: 'Featured', exact: true })
          .waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () => !document.documentElement.hasAttribute('data-review-transition'),
        )
        if (!(await photoIntent.innerText()).includes('Featured'))
          throw Error('Featured label disappeared')
        if (
          (await photoIntent.evaluate(element => getComputedStyle(element).color)) !==
          intentColor
        )
          throw Error('Featured inherited unreadable thumbnail text color')
        await page.screenshot({
          path: output + '/' + name + '-' + width + '-featured.png',
          fullPage: true,
        })
        await page.getByRole('button', { name: 'Edit image text', exact: true }).click()
        await page.locator('[data-review-busy="true"]').waitFor()
        await page.waitForFunction(() =>
          document.querySelector('header button')?.matches(':disabled'),
        )
        if (!(await accept.isDisabled()))
          throw Error('Header acceptance permits pending text edits')
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Cancel', exact: true })
          .click()
        await accept.click()
        await page.locator('[data-accepted="true"]').waitFor({ state: 'attached' })
        const acceptedInput = await page.evaluate(() => (globalThis as any).acceptInput)
        if (acceptedInput.mode !== 'acceptAll' || acceptedInput.reviews.length !== 1)
          throw Error('Missing task-wide acceptance mode or evidence')
        if (
          acceptedInput.taskId !== 'task' ||
          acceptedInput.proposalId !== 'proposal' ||
          acceptedInput.proposalVersion !== 'v1'
        )
          throw Error('Header accepted wrong submission')
      }
      await page.goto(base + '/__task-image-review.html?photo&context')
      const contextThumb = page.locator('[data-gallery-thumb-id="second"]')
      const submittedThumb = page.locator('[data-gallery-thumb-id="photo"]')
      await contextThumb.waitFor()
      if (width === 1440) {
        const imageBounds = await page
          .locator('[data-image-editor-viewport]')
          .boundingBox()
        const stripBounds = await contextThumb.boundingBox()
        if (
          !imageBounds ||
          !stripBounds ||
          stripBounds.x < imageBounds.x + imageBounds.width
        )
          throw Error('Thumbnail strip is not on the right')
      }
      await page.mouse.move(0, 0)
      for (const thumb of [submittedThumb, contextThumb]) {
        const label = thumb.getByRole('button', {
          name: 'Change image intent',
          exact: true,
        })
        if (!(await label.isVisible()) || !(await label.innerText()).trim())
          throw Error('Inactive thumbnail lost its intent label')
      }
      if (width === 1440) {
        const top = await submittedThumb.boundingBox()
        const viewport = await page
          .locator('[data-image-editor-viewport]')
          .boundingBox()
        if (!top || !viewport || top.y - viewport.y < 12)
          throw Error('Missing top padding above thumbnail strip')
      }
      const submittedDot = submittedThumb.getByRole('img', {
        name: 'Photo submitted with this report',
      })
      await submittedDot.waitFor()
      if (
        await contextThumb
          .getByRole('img', { name: 'Photo submitted with this report' })
          .count()
      )
        throw Error('Existing image has a new-photo dot')
      if (await page.getByText(/^(Submitted|Existing)$/).count())
        throw Error('Text badges remain on thumbnails')
      // Measure related elements in one frame while the responsive rail is resizing.
      const { dotBounds, thumbBounds } = await submittedDot.evaluate(dot => ({
        dotBounds: dot.getBoundingClientRect().toJSON(),
        thumbBounds: dot
          .closest('[data-gallery-thumb-id]')
          ?.querySelector('button[aria-pressed]')
          ?.getBoundingClientRect()
          .toJSON(),
      }))
      if (
        !dotBounds ||
        !thumbBounds ||
        dotBounds.width > 12 ||
        Math.abs(dotBounds.y - thumbBounds.y - 8) > 1 ||
        Math.abs(
          thumbBounds.x + thumbBounds.width - dotBounds.x - dotBounds.width - 8,
        ) > 1
      )
        throw Error(
          'New-photo dot is not small and top-right: ' +
            JSON.stringify({ dotBounds, thumbBounds }),
        )
      if (
        await contextThumb
          .getByRole('button', { name: 'Change image intent', exact: true })
          .isDisabled()
      )
        throw Error('Existing thumbnail intent is disabled')
      await contextThumb.locator('button[aria-pressed]').click()
      if (
        !(await page
          .getByRole('button', { name: 'Edit image text', exact: true })
          .isDisabled())
      )
        throw Error('Existing context image became editable')
      if (
        await page
          .locator('[data-image-editor-viewport]')
          .getByRole('button', { name: 'Change image intent', exact: true })
          .isDisabled()
      )
        throw Error('Existing context intent is disabled')
      if ((await page.evaluate(() => (globalThis as any).reviewCalls.length)) !== 0)
        throw Error('Browsing context mutated the gallery')
      await contextThumb
        .getByRole('button', { name: 'Change image intent', exact: true })
        .click()
      await page.getByRole('button', { name: 'General', exact: true }).click()
      await page.locator('[data-review-busy="false"]').waitFor()
      // Wait for the previous popover to finish closing before opening the toolbar menu.
      await page
        .getByRole('button', { name: 'General', exact: true })
        .waitFor({ state: 'hidden' })
      const existingPatch = await page.evaluate(
        () => (globalThis as any).reviewCalls.at(-1)?.patch,
      )
      if (existingPatch?.imageId !== 'second' || existingPatch?.intent !== 'general')
        throw Error('Existing image intent did not save')
      if (!(await contextThumb.innerText()).toLowerCase().includes('general'))
        throw Error('Existing image intent did not reconcile')
      await page
        .locator('[data-image-editor-viewport]')
        .getByRole('button', { name: 'Change image intent', exact: true })
        .click()
      await page.getByRole('button', { name: 'Featured', exact: true }).click()
      await page.waitForFunction(() => (globalThis as any).reviewCalls.length === 2)
      await page.locator('[data-review-busy="false"]').waitFor()
      if (!(await contextThumb.innerText()).toLowerCase().includes('featured'))
        throw Error('Toolbar intent did not update existing thumbnail')
      await submittedThumb.locator('button[aria-pressed]').click()
      await page.waitForFunction(
        () =>
          !document
            .querySelector('button[aria-label="Edit image text"]')
            ?.hasAttribute('disabled'),
      )
      await page.screenshot({
        path: output + '/' + name + '-' + width + '-gallery-context.png',
        fullPage: true,
      })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Gallery context overflows horizontally')
      // A decision advances the Feature; historical outcome views must not offer conflict actions.
      for (const scenario of ['stale&completed', 'stale&outcome', 'stale']) {
        await page.goto(base + '/__task-image-review.html?photo&multi&' + scenario)
        await page.locator('[data-review-busy="false"]').waitFor()
        await page.locator('[data-image-editor-viewport]').waitFor()
        if (
          await page
            .getByRole('button', { name: 'Automatic image sorting', exact: true })
            .count()
        )
          throw Error('Read-only or stale review exposes a sort control: ' + scenario)
        const shouldWarn = scenario === 'stale'
        if (
          (await page
            .getByText(
              'The Feature changed. Compare your edits with the current version before continuing.',
              { exact: true },
            )
            .count()) !== Number(shouldWarn)
        )
          throw Error('Incorrect conflict warning for ' + scenario)
        if (
          (await page
            .getByRole('button', { name: 'Compare with current Feature', exact: true })
            .count()) !== Number(shouldWarn)
        )
          throw Error('Incorrect conflict action for ' + scenario)
      }
      for (const mode of ['acceptAll', 'acceptClassified']) {
        await page.goto(base + '/__task-image-review.html?photo&proposals')
        const other = page.locator('[data-gallery-thumb-id="other"]')
        await other.waitFor()
        if (await page.getByText(/Submission \d+ of/).count())
          throw Error('Internal submission selector remains')
        await page
          .locator('[data-gallery-thumb-id="photo"]')
          .getByRole('img', { name: 'Photo submitted with this report' })
          .waitFor()
        await other
          .getByRole('img', { name: 'Photo submitted with this report' })
          .waitFor()
        await other.locator('button[aria-pressed]').click()
        const toolbarIntent = page
          .locator('[data-image-editor-viewport]')
          .getByRole('button', { name: 'Change image intent', exact: true })
        await toolbarIntent.click()
        await page.getByRole('button', { name: 'General', exact: true }).click()
        await page.waitForFunction(() => (globalThis as any).reviewCalls.length === 1)
        const saved = await page.evaluate(() => (globalThis as any).reviewCalls[0])
        if (saved.proposalId !== 'proposal-two' || saved.patch.imageId !== 'other')
          throw Error('Edited the wrong proposal from the unified gallery')
        await page.locator('[data-review-busy="false"]').waitFor()
        await page
          .getByRole('button', {
            name: mode === 'acceptAll' ? 'Accept All' : 'Accept Classified',
            exact: true,
          })
          .click()
        await page.locator('[data-accepted="true"]').waitFor({ state: 'attached' })
        const input = await page.evaluate(() => (globalThis as any).acceptInput)
        if (
          input.mode !== mode ||
          input.reviews.length !== 2 ||
          input.reviews[1].expectedReviewId !== 'review-1'
        )
          throw Error('Task action omitted a submission or its saved edit')
      }
      console.log(name, width, 'passed')
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
