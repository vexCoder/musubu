import fetch from 'electron-fetch'

export default async function waitForUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let interval: NodeJS.Timeout
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new Error(`Failed to reach ${url} within the timeout period`))
    }, 30000)

    interval = setInterval(() => {
      fetch(url)
        .then((response) => {
          if (response.ok) {
            clearInterval(interval)
            clearTimeout(timeout)
            resolve()
          }
        })
        .catch((error) => {
          logger.error(`Error fetching ${url}:`, error)
        })
    }, 1000)
  })
}
