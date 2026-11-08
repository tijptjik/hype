import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const output = 'output/playwright/task-image-review'
await mkdir(output, { recursive: true })
const mock = `
const entry = {imageRevisionId:'original',intent:'undefined',isPublished:true,caption:{en:'','zh-hant':'原有說明'},alt:{}};
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

      await page.goto(base + '/__task-image-review.html?photo')
      await page.locator('[data-review-busy="false"]').waitFor()
      const openText = page.getByRole('button', {
        name: 'Edit image text',
        exact: true,
      })
      await openText.click()
      {
        const multilingual = page
          .getByRole('dialog')
          .getByRole('button', { name: 'Multilingual', exact: true })
        if ((await multilingual.getAttribute('aria-expanded')) === 'false')
          await multilingual.click()
      }
      const dialog = page.getByRole('dialog')
      const toggle = dialog.getByRole('button', { name: 'Multilingual', exact: true })
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
      const enCaption = dialog.getByRole('textbox', {
        name: 'Caption · en',
        exact: true,
      })
      const zhCaption = dialog.getByRole('textbox', {
        name: 'Caption · zh-Hant',
        exact: true,
      })
      await enCaption.fill('Saved English caption')
      await zhCaption.fill('已儲存說明')
      await dialog
        .getByRole('textbox', { name: 'Alt text · en', exact: true })
        .fill('Saved English alternative')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      await page.locator('[data-review-busy="false"]').waitFor()
      await openText.click()
      {
        const multilingual = page
          .getByRole('dialog')
          .getByRole('button', { name: 'Multilingual', exact: true })
        if ((await multilingual.getAttribute('aria-expanded')) === 'false')
          await multilingual.click()
      }
      if ((await enCaption.inputValue()) !== 'Saved English caption')
        throw Error('Caption did not reload')
      if ((await zhCaption.inputValue()) !== '已儲存說明')
        throw Error('Chinese caption did not reload')
      if (
        (await dialog
          .getByRole('textbox', { name: 'Alt text · en', exact: true })
          .inputValue()) !== 'Saved English alternative'
      )
        throw Error('Alt text did not reload')
      await enCaption.fill('Discard this draft')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      await openText.click()
      {
        const multilingual = page
          .getByRole('dialog')
          .getByRole('button', { name: 'Multilingual', exact: true })
        if ((await multilingual.getAttribute('aria-expanded')) === 'false')
          await multilingual.click()
      }
      if ((await enCaption.inputValue()) !== 'Saved English caption')
        throw Error('Cancel retained unsaved draft')
      if ((await page.evaluate(() => globalThis.reviewCalls.length)) !== 1)
        throw Error('Cancel wrote a review')
      await page.screenshot({
        path: output + '/' + name + '-' + width + '-multilingual-readback.png',
      })
      console.log(
        name,
        width,
        'multilingual caption and alt save/reopen, cancel passed',
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
