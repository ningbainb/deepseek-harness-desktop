import { COMMUNITY_QQ_GROUP, COMMUNITY_QQ_URL, GITHUB_FEEDBACK_URL } from '../community-links.mjs'

const query = new URLSearchParams(window.location.search)
const theme = query.get('theme')
if (theme === 'dark' || theme === 'light') {
  document.documentElement.dataset.dshDesktopTheme = theme
}
const qrImage = query.get('qr')
const qr = document.querySelector('#community-qr')
const status = document.querySelector('#qr-status')

document.querySelector('#join-community').href = COMMUNITY_QQ_URL
document.querySelector('#community-group-number').textContent = COMMUNITY_QQ_GROUP
document.querySelector('#open-feedback').href = GITHUB_FEEDBACK_URL

if (qrImage?.startsWith('data:image/jpeg;base64,')) {
  qr.addEventListener('error', () => {
    qr.hidden = true
    status.hidden = false
    status.textContent = '二维码暂时不可用，请使用一键加群'
  }, { once: true })
  qr.src = qrImage
  qr.hidden = false
  status.hidden = true
} else {
  status.textContent = '二维码暂时不可用，请使用一键加群'
}
