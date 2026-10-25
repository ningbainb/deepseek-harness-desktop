import { composeEntries } from '@deepseek-ai/dsh-app-boot'

const ROW_ID = 'client-hmr'
const OFFICIAL_PACKAGE = '@deepseek-ai/dsh-client-hmr'
const DESKTOP_PACKAGE = '@linxin666/dsh-desktop-client-hmr'

function matchingRows(entries) {
  return entries.flatMap(entry => [
    ...(entry.id === ROW_ID ? [entry] : []),
    ...(entry.group && Array.isArray(entry.config) ? matchingRows(entry.config) : []),
  ])
}

export function createDesktopConfigurationGuard() {
  let aliased = false
  return {
    record(rawPatches, mappedPatches) {
      aliased = false
      if (!Array.isArray(rawPatches) || !Array.isArray(mappedPatches)) throw new TypeError('Configuration guard requires patch arrays')
      const raw = matchingRows(composeEntries(rawPatches))
      const mapped = matchingRows(composeEntries(mappedPatches))
      aliased = raw.length === 1 && mapped.length === 1
        && raw[0].name === OFFICIAL_PACKAGE && mapped[0].name === DESKTOP_PACKAGE
    },
    nameFor(entry) {
      const { id, name } = entry.options
      return aliased && id === ROW_ID && name === DESKTOP_PACKAGE ? OFFICIAL_PACKAGE : name
    },
  }
}

const readonly = {
  set: () => false,
  defineProperty: () => false,
  deleteProperty: () => false,
  setPrototypeOf: () => false,
  preventExtensions: () => false,
}

function configurationFacade(actual, nameFor) {
  const options = new Proxy({}, {
    ...readonly,
    get: (_target, key) => key === 'name' ? nameFor(actual) : Reflect.get(actual.options, key, actual.options),
    has: (_target, key) => Reflect.has(actual.options, key),
    ownKeys: () => Reflect.ownKeys(actual.options),
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(actual.options, key)
      return descriptor && { configurable: true, enumerable: descriptor.enumerable, writable: false,
        value: key === 'name' ? nameFor(actual) : Reflect.get(actual.options, key, actual.options) }
    },
  })
  const methods = new Map()
  return new Proxy(actual, {
    ...readonly,
    get(target, key) {
      if (key === 'options') return options
      const value = Reflect.get(target, key, target)
      if (typeof value !== 'function' || key === 'constructor') return value
      let method = methods.get(key)
      if (!method || method.original !== value) {
        method = { original: value, bound: value.bind(target) }
        methods.set(key, method)
      }
      return method.bound
    },
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
      if (key !== 'options' || !descriptor?.configurable) return descriptor
      return { ...descriptor, writable: false, value: options }
    },
  })
}

export function createDesktopConfigEditor(ConfigEditor) {
  return class DesktopConfigEditor extends ConfigEditor {
    constructor(ctx) {
      super(ctx)
      const actualToFacade = new WeakMap()
      const facadeToActual = new WeakMap()
      const nameFor = entry => ctx.get('desktopConfigurationGuard')?.nameFor(entry) ?? entry.options.name
      const project = actual => {
        if (nameFor(actual) === actual.options.name) return actual
        let facade = actualToFacade.get(actual)
        if (!facade) {
          facade = configurationFacade(actual, nameFor)
          actualToFacade.set(actual, facade)
          facadeToActual.set(facade, actual)
        }
        return facade
      }
      this.entries = () => super.entries().map(project)
      this.edit = async (entry, change) => {
        const actual = facadeToActual.get(entry) ?? entry
        return super.edit(super.entries().includes(actual) ? project(actual) : entry, change)
      }
    }
  }
}
