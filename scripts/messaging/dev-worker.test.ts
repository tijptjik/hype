import { describe, expect, it } from 'bun:test'
import { workerPlan } from './dev-worker'

describe('messaging workspace launches', () => {
  it('preserves the supplied session directory and selects local WhatsApp bindings', () => {
    const plan = workerPlan('whatsapp', {
      WHATSAPP_STATE_DIR: '/tmp/synthetic-existing-session',
    })
    expect(plan.cwd.endsWith('/workers/whatsapp')).toBe(true)
    expect(plan.args).toContain('--local')
    expect(plan.args[plan.args.indexOf('--env') + 1]).toBe('local')
    expect(plan.args[plan.args.indexOf('--persist-to') + 1]).toBe(
      '/tmp/synthetic-existing-session',
    )
    expect(plan.args).not.toContain('--remote')
  })
  it('requires an explicit state choice instead of silently replacing a login', () => {
    expect(() => workerPlan('telegram', {})).toThrow('TELEGRAM_STATE_DIR')
  })
  it('uses separate state paths and inspector ports for concurrent accounts', () => {
    const env = { HYPE_MESSAGING_STATE_DIR: '/tmp/synthetic-messaging' }
    const wa = workerPlan('whatsapp', env),
      tg = workerPlan('telegram', env)
    expect(wa.args).toContain('/tmp/synthetic-messaging/whatsapp')
    expect(tg.args).toContain('/tmp/synthetic-messaging/telegram')
    expect(tg.args[tg.args.indexOf('--env') + 1]).toBe('')
    expect(wa.args[wa.args.indexOf('--inspector-port') + 1]).not.toBe(
      tg.args[tg.args.indexOf('--inspector-port') + 1],
    )
  })
  it('keeps notification authorization on the web application database', () => {
    const plan = workerPlan('messaging-notifications', {})
    expect(plan.args[plan.args.indexOf('--persist-to') + 1]).toBe(
      `${plan.cwd}/../../.wrangler/state`.replace(
        '/workers/messaging-notifications/../..',
        '',
      ),
    )
  })
  it('rejects account state inside the source checkout', () => {
    const plan = workerPlan('telegram-calls', {})
    expect(() =>
      workerPlan('telegram', { TELEGRAM_STATE_DIR: `${plan.cwd}/state` }),
    ).toThrow('outside')
  })
})
