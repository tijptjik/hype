;(() => {
  const data = JSON.parse(document.querySelector('#review-data').textContent)
  const $ = id => document.getElementById(id)
  const labels = {
    'ghost-signs': 'Ghost Signs',
    'eln-venues': 'ELN venues',
    'independent-bookstores': 'Independent Bookstores',
    'breadline-donors': 'Breadline donors',
  }
  const reasonLabels = {
    intangible: 'Marked intangible',
    draft: 'Draft',
    'non-point': 'Non-point geometry',
    'needs-investigation': 'Needs investigation',
    associated: 'Associated',
  }
  const storeKey = 'hype:location-kind-reviews:v1:' + data.planId
  let reviews = {},
    selected = decodeURIComponent(location.hash.slice(1)) || null,
    filtered = [],
    storageAvailable = true
  try {
    reviews = JSON.parse(localStorage.getItem(storeKey) || '{}')
  } catch {
    storageAvailable = false
  }
  // Build every record label with textContent so saved descriptions remain evidence, not executable markup.
  const node = (tag, text, attrs = {}) => {
    const element = document.createElement(tag)
    if (text !== undefined) element.textContent = String(text)
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value)
    return element
  }
  const title = record =>
    (
      record.translations.find(t => t.locale === 'en' && t.title.trim()) ||
      record.translations.find(t => t.title.trim())
    )?.title || 'Untitled Feature'
  const address = record =>
    (
      record.translations.find(t => t.locale === 'en' && t.displayAddress) ||
      record.translations.find(t => t.displayAddress)
    )?.displayAddress || 'No saved address'
  const name = names =>
    names.en ||
    names['zh-Hant'] ||
    names['zh-hant'] ||
    Object.values(names)[0] ||
    'Unnamed Location'
  const link = (text, url) =>
    node('a', text, { href: url, target: '_blank', rel: 'noopener noreferrer' })
  const isMissing = record => record.locationId === null
  const option = (value, text) => node('option', text, { value })
  const fields = values => {
    const list = node('dl')
    for (const [label, value] of values) {
      list.append(node('dt', label), node('dd', value ?? '—'))
    }
    return list
  }
  const section = (heading, tone) => {
    const element = node('section')
    if (tone) element.dataset.tone = tone
    element.append(node('h3', heading))
    return element
  }
  const actionsFor = record =>
    isMissing(record)
      ? [
          ['keep-unassociated', 'Keep unassociated'],
          ['review-flags', 'Review draft / intangible flag'],
          ['propose-local-location', 'Propose a new local Location'],
          ['review-nearby-location', 'Review a nearby existing Location'],
          ['needs-research', 'Needs more research'],
        ]
      : [
          ['accept-kind', 'Accept proposed kind / no-op'],
          ['needs-research', 'Needs more research'],
          ['review-identity', 'Review the associated identity'],
        ]
  const currentScope = () => $('scope').value
  const matchesScope = (record, scope) =>
    scope === 'all' ||
    (scope === 'unassociated'
      ? isMissing(record)
      : scope === 'conflict'
        ? ['conflict', 'unresolved'].includes(record.assertion?.decision)
        : record.assertion?.decision === scope)
  const countReviewed = records => records.filter(r => reviews[r.featureId]).length
  const recordById = new Map(data.records.map(r => [r.featureId, r]))
  // A review may travel only with the snapshot/plan that supplied its expected values.
  const exportRows = () =>
    Object.entries(reviews)
      .filter(([id]) => recordById.has(id))
      .map(([id, review]) => {
        const record = recordById.get(id)
        return {
          manifestVersion: 1,
          planId: data.planId,
          featureId: id,
          locationId: record.locationId,
          imageId: null,
          field: isMissing(record) ? 'location.association.review' : 'location.kind',
          expectedBefore: isMissing(record) ? null : record.assertion.expectedBefore,
          proposedAfter: isMissing(record)
            ? {
                recommendation: review.action,
                candidateLocationId: review.candidateLocationId || null,
              }
            : review.action === 'accept-kind'
              ? record.assertion.proposedAfter
              : null,
          decision:
            review.action === 'accept-kind'
              ? record.assertion.decision
              : review.action === 'keep-unassociated'
                ? 'no-change'
                : 'unresolved',
          expectedFeatureModifiedAt: record.expectedModifiedAt,
          expectedAssociation: record.association,
          expectedLocationRevisionId: record.assertion?.expectedBaseline?.id || null,
          expectedFlags: { isDraft: record.isDraft, isIntangible: record.isIntangible },
          review,
          evidence: [
            {
              recordReference: {
                featureId: id,
                splitReceiptSha256: data.splitReceiptSha256,
              },
              supports: 'association/type',
              quotedText: record.explanation,
              accessedAt: data.exportedAt,
              sourceDate: null,
            },
          ],
          effectiveDate: null,
          datePrecision: null,
          confidence: 'review-required',
          notes: review.notes,
        }
      })
  function updateCounts() {
    $('export-count').textContent = Object.keys(reviews).filter(id =>
      recordById.has(id),
    ).length
    $('export').disabled = !exportRows().length
    $('review-count').textContent = `${countReviewed(filtered)} reviewed`
    $('save-state').textContent = storageAvailable
      ? 'Review notes stay in this browser.'
      : 'Browser storage unavailable. Export reviews before closing.'
  }
  function persist() {
    try {
      localStorage.setItem(storeKey, JSON.stringify(reviews))
      storageAvailable = true
    } catch {
      storageAvailable = false
    }
    updateCounts()
  }
  function renderResults() {
    const search = $('search').value.trim().toLocaleLowerCase()
    filtered = data.records.filter(
      record =>
        matchesScope(record, currentScope()) &&
        ($('dataset').value === 'all' || record.dataset === $('dataset').value) &&
        ($('reason').value === 'all' || record.reason === $('reason').value) &&
        ($('review-filter').value === 'all' ||
          Boolean(reviews[record.featureId]) ===
            ($('review-filter').value === 'reviewed')) &&
        (!search ||
          [
            record.featureId,
            record.locationId,
            ...record.translations.flatMap(t => [t.title, t.displayAddress]),
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase()
            .includes(search)),
    )
    $('results').replaceChildren()
    $('result-count').textContent =
      `${filtered.length} ${filtered.length === 1 ? 'Feature' : 'Features'}`
    $('empty').hidden = filtered.length > 0
    if (!filtered.some(r => r.featureId === selected))
      selected = filtered[0]?.featureId || null
    if (selected) history.replaceState(null, '', '#' + encodeURIComponent(selected))
    for (const record of filtered) {
      const item = node('li'),
        button = node('button', undefined, {
          type: 'button',
          'aria-current': String(record.featureId === selected),
        })
      button.append(
        node('strong', title(record)),
        node('span', `${labels[record.dataset]} · ${address(record)}`),
        node(
          'small',
          isMissing(record)
            ? reasonLabels[record.reason]
            : `${record.assertion.expectedBefore} → ${record.assertion.proposedAfter || 'review'}`,
        ),
      )
      if (reviews[record.featureId])
        button.append(node('small', 'Reviewed', { 'data-done': 'true' }))
      button.addEventListener('click', () => {
        selected = record.featureId
        renderResults()
      })
      item.append(button)
      $('results').append(item)
    }
    document.querySelectorAll('[data-scope]').forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.scope === currentScope()),
      )
    })
    updateCounts()
    renderDetail()
  }
  function step(direction) {
    const index = filtered.findIndex(record => record.featureId === selected)
    if (index + direction < 0 || index + direction >= filtered.length) return
    selected = filtered[index + direction].featureId
    renderResults()
    document
      .querySelector('#results [aria-current=true]')
      ?.scrollIntoView({ block: 'nearest' })
  }
  function renderDetail() {
    const detail = $('detail')
    detail.replaceChildren()
    const record = recordById.get(selected)
    if (!record) {
      detail.append(section('Choose a Feature to review'))
      return
    }
    const review = reviews[record.featureId] || {}
    const header = node('header'),
      intro = node('div'),
      navigation = node('div')
    intro.append(
      node('small', `${labels[record.dataset]} / ${record.layerName}`),
      node('h2', title(record)),
      node('p', record.featureId),
      link('Open Feature in Hype ↗', record.adminUrl),
    )
    const previous = node('button', '←', {
        type: 'button',
        'aria-label': 'Previous Feature',
      }),
      next = node('button', '→', { type: 'button', 'aria-label': 'Next Feature' })
    previous.disabled = filtered[0]?.featureId === selected
    next.disabled = filtered.at(-1)?.featureId === selected
    previous.onclick = () => step(-1)
    next.onclick = () => step(1)
    navigation.append(previous, next)
    header.append(intro, navigation)
    detail.append(header)
    const why = section(
      isMissing(record) ? 'Why there is no Location link' : 'What the seed proposes',
      'reason',
    )
    why.append(node('p', record.explanation))
    if (!isMissing(record))
      why.append(
        node(
          'p',
          `${record.assertion.expectedBefore} → ${record.assertion.proposedAfter || 'Unresolved'} · ${record.assertion.decision}`,
        ),
      )
    why.append(
      node(
        'small',
        record.historicalExclusionVerified
          ? `Verified in the original split exclusion receipt · ${reasonLabels[record.reason]}`
          : isMissing(record)
            ? 'Based on the saved eligibility flags; no historical exclusion receipt supplied.'
            : 'Existing association retained.',
      ),
    )
    if (record.ruleReference) why.append(node('code', record.ruleReference))
    why.append(node('p', record.nextStep))
    detail.append(why)
    const facts = section('Saved record')
    const marks = node('div')
    for (const [key, label] of [
      ['isDraft', 'Draft'],
      ['isIntangible', 'Intangible'],
      ['isArchived', 'Archived'],
      ['isPublished', 'Published'],
      ['isVisitable', 'Visitable'],
    ])
      marks.append(node('mark', `${label}: ${record[key] ? 'yes' : 'no'}`))
    facts.append(marks)
    const translations = node('div', undefined, { 'data-fields': '' })
    for (const translation of record.translations)
      translations.append(
        fields([
          [`Title · ${translation.locale}`, translation.title || '(empty)'],
          [`Address · ${translation.locale}`, translation.displayAddress || '(empty)'],
        ]),
      )
    facts.append(translations)
    const identity = fields([
      ['Location ID', record.locationId || 'None'],
      ['Intended kind', record.requiredKind],
      [
        'Coordinates',
        record.point?.map(v => v.toFixed(6)).join(', ') || 'No valid Point',
      ],
      ['Created', record.createdAt],
      ['Modified', record.modifiedAt],
    ])
    identity.style.marginTop = '16px'
    facts.append(identity)
    if (record.point)
      facts.append(
        link(
          'View saved point on OpenStreetMap ↗',
          `https://www.openstreetmap.org/?mlat=${record.point[1]}&mlon=${record.point[0]}#map=19/${record.point[1]}/${record.point[0]}`,
        ),
      )
    detail.append(facts)
    const nearby = section(
      isMissing(record)
        ? 'Nearby existing Locations · distance only'
        : 'Associated Location',
    )
    if (isMissing(record)) {
      nearby.append(
        node(
          'p',
          record.nearby.length
            ? 'Saved identities within 250 m. A nearby point is a lead to review; it is not a confirmed match.'
            : 'No existing local Location within 250 m. External source matching was not performed by this tool.',
        ),
      )
      const candidates = node('ul')
      for (const candidate of record.nearby) {
        const li = node('li'),
          input = node('input', undefined, {
            type: 'radio',
            name: 'candidate',
            value: candidate.id,
            id: 'candidate-' + candidate.id,
          }),
          label = node('label', name(candidate.names), {
            for: 'candidate-' + candidate.id,
          })
        input.checked = review.candidateLocationId === candidate.id
        label.append(
          node(
            'small',
            `${candidate.distanceMetres} m · ${candidate.kind} · ${candidate.state} · ${candidate.projects.join(', ')}`,
          ),
          node('code', candidate.id),
        )
        li.append(input, label)
        candidates.append(li)
      }
      nearby.append(candidates)
    } else {
      const baseline = record.assertion.expectedBaseline
      const baselineFacts = baseline ? JSON.parse(baseline.facts) : {}
      nearby.append(
        fields([
          [
            'Names',
            Object.values(baselineFacts.names || {}).join(' / ') || 'No saved name',
          ],
          ['Baseline', baseline?.id || 'None'],
          ['Revision', baseline?.sequence || '—'],
          ['Reason', record.assertion.reason],
        ]),
      )
    }
    detail.append(nearby)
    const description = record.translations.find(t => t.description)?.description
    if (description || record.images.length) {
      const media = node('details')
      media.append(
        node('summary', `Saved description & photos (${record.images.length})`),
      )
      const content = node('div')
      if (description) content.append(node('pre', description))
      // Load remote photos only when the reviewer explicitly opens this section.
      let photosLoaded = false
      media.addEventListener('toggle', () => {
        if (media.open && !photosLoaded) {
          photosLoaded = true
          for (const photo of record.images) {
            const anchor = link('', photo.url)
            anchor.append(
              node('img', undefined, {
                src: photo.url,
                alt: 'Saved Feature image ' + photo.id,
                loading: 'lazy',
              }),
            )
            content.append(anchor)
          }
        }
      })
      media.append(content)
      detail.append(media)
    }
    const reviewSection = section('Your review', 'review'),
      form = node('form', undefined, { id: 'review-form' })
    const actionLabel = node('label', 'Recommendation'),
      action = node('select', undefined, { id: 'action', required: '' })
    action.append(option('', 'Choose a recommendation…'))
    for (const [value, label] of actionsFor(record)) action.append(option(value, label))
    action.value = review.action || ''
    actionLabel.append(action)
    const noteLabel = node('label', 'Notes / evidence'),
      notes = node('textarea', undefined, {
        id: 'notes',
        rows: '3',
        placeholder:
          'What should happen, and why? A historic record can still have a physical Location.',
      })
    notes.value = review.notes || ''
    noteLabel.append(notes)
    const buttons = node('div'),
      save = node('button', 'Save review', { type: 'submit' }),
      clear = node('button', 'Clear review', { type: 'button' }),
      saveStatus = node('span', review.updatedAt ? 'Saved locally' : '', {
        id: 'record-save',
        role: 'status',
      })
    clear.disabled = !reviews[record.featureId]
    clear.onclick = () => {
      delete reviews[record.featureId]
      persist()
      renderResults()
    }
    buttons.append(save, clear, saveStatus)
    form.append(actionLabel, noteLabel, buttons)
    form.onsubmit = event => {
      event.preventDefault()
      const candidate =
        document.querySelector('input[name=candidate]:checked')?.value || null
      if (action.value === 'review-nearby-location' && !candidate) {
        saveStatus.textContent = 'Choose a nearby Location above first.'
        return
      }
      reviews[record.featureId] = {
        action: action.value,
        notes: notes.value,
        candidateLocationId:
          action.value === 'review-nearby-location' ? candidate : null,
        updatedAt: new Date().toISOString(),
      }
      persist()
      renderResults()
    }
    reviewSection.append(form)
    detail.append(reviewSection)
  }
  if (selected && recordById.has(selected) && !isMissing(recordById.get(selected)))
    $('scope').value = 'all'
  $('snapshot').textContent =
    'Plan · ' +
    new Date(data.planCreatedAt).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Hong_Kong',
    }) +
    ' HKT'
  $('missing-count').textContent = data.counts.unassociatedFeatures
  $('change-count').textContent = data.counts.supported
  $('correct-count').textContent = data.counts['no-change']
  $('total-count').textContent = data.counts.totalFeatures
  $('why-copy').textContent =
    `${data.blockers.intangible || 0} marked intangible · ${data.blockers.draft || 0} drafts. ` +
    (data.verifiedHistoricalExclusions === data.counts.unassociatedFeatures
      ? `${data.verifiedHistoricalExclusions} verified against the original split receipt. Neither group reached source matching in that split.`
      : `Current eligibility rules skip these records. ${data.verifiedHistoricalExclusions} historical exclusions verified.`)
  for (const key of [...new Set(data.records.map(record => record.dataset))])
    $('dataset').append(option(key, labels[key]))
  for (const id of ['dataset', 'scope', 'reason', 'review-filter'])
    $(id).addEventListener('change', renderResults)
  $('search').addEventListener('input', renderResults)
  document.querySelectorAll('[data-scope]').forEach(button => {
    button.addEventListener('click', () => {
      $('scope').value = button.dataset.scope
      $('reason').value = 'all'
      renderResults()
    })
  })
  $('export').onclick = () => {
    const blob = new Blob(
      [
        exportRows()
          .map(row => JSON.stringify(row))
          .join('\n') + '\n',
      ],
      { type: 'application/x-ndjson' },
    )
    const url = URL.createObjectURL(blob),
      anchor = node('a', '', {
        href: url,
        download: 'location-reviews-' + data.planId.slice(0, 12) + '.jsonl',
      })
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  $('import').onclick = () => $('import-file').click()
  $('import-file').onchange = async () => {
    const file = $('import-file').files[0]
    if (!file) return
    try {
      const parsed = (await file.text())
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
      for (const row of parsed) {
        const record = recordById.get(row.featureId)
        if (
          !record ||
          row.planId !== data.planId ||
          row.expectedFeatureModifiedAt !== record.expectedModifiedAt ||
          !row.review ||
          !actionsFor(record).some(([action]) => action === row.review.action) ||
          typeof row.review.notes !== 'string' ||
          (row.review.candidateLocationId &&
            !record.nearby.some(
              candidate => candidate.id === row.review.candidateLocationId,
            ))
        )
          throw new Error(
            'This file does not match this plan and its expected records.',
          )
      }
      for (const row of parsed) reviews[row.featureId] = row.review
      persist()
      renderResults()
      $('save-state').textContent = `Imported ${parsed.length} reviews.`
    } catch (error) {
      $('save-state').textContent = 'Import failed: ' + error.message
    }
    $('import-file').value = ''
  }
  document.addEventListener('keydown', event => {
    if (
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return
    if (event.key === 'j') step(1)
    if (event.key === 'k') step(-1)
  })
  renderResults()
})()
