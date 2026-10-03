import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desktopLocalPath } from '../src/desktop-remote-path.mjs'

test('desktop private pipe maps only known remote channel mirrors to local routes', () => {
  for (const root of ['api', 'sidebar', 'git', 'pet']) {
    assert.equal(desktopLocalPath(`/remote/${root}`), `/${root}`)
    assert.equal(desktopLocalPath(`/remote/${root}/list`), `/${root}/list`)
  }
})

test('desktop private pipe preserves unrelated and prefix-confusable routes', () => {
  for (const path of ['/api/session/list', '/remote', '/remote/plugins', '/remote/apix/list', '/remote/sidebarx', '/remote/remote/api/list', '/remote/api%2fsecret']) {
    assert.equal(desktopLocalPath(path), path)
  }
})
