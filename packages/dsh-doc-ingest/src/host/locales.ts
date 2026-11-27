export const documentIngestMessages = {
  en: {
    approveWeb: (origin: string) => `Allow the document reader to retrieve a webpage from ${origin} and follow public redirects?`,
    approveIndex: (path: string) => `Add ${path} to this workspace's local knowledge index?`,
  },
  zh: {
    approveWeb: (origin: string) => `允许文档阅读器从 ${origin} 获取网页并跟随公网重定向吗？`,
    approveIndex: (path: string) => `将 ${path} 加入当前工作区的本地知识库吗？`,
  },
}
