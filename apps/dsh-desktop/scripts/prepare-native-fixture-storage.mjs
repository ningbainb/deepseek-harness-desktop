import { prepareNativeFixtureStorage } from './native-fixture-storage.mjs'

await prepareNativeFixtureStorage()
process.stdout.write('Prepared private native fixture storage for hosted Windows QA.\n')
