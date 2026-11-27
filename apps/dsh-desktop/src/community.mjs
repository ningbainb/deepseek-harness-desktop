import { readFileIfPresent } from './read-file-if-present.mjs'
import { join } from 'node:path'
import { COMMUNITY_QQ_GROUP } from './community-links.mjs'

export async function createCommunityQrImage(resourcesPath) {
  const file = resourcesPath === undefined
    ? new URL(`../../../website/assets/qq-group-${COMMUNITY_QQ_GROUP}.jpg`, import.meta.url)
    : join(resourcesPath, 'community-qq.jpg')
  const image = await readFileIfPresent(file)
  return image && `data:image/jpeg;base64,${image.toString('base64')}`
}
