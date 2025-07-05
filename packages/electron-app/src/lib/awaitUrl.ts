import fetch from 'electron-fetch'

export default async function awaitUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      fetch(url)
        .then((response) => {
          if (response.ok) {
            clearInterval(interval)
            resolve()
          }
        })
        .catch(() => {
          // Ignore errors, will retry
        })
    }, 1000)

    // Optional: Set a timeout to reject the promise after a certain period
    setTimeout(() => {
      clearInterval(interval)
      reject(new Error(`Failed to reach ${url} within the timeout period`))
    }, 30000) // 30 seconds timeout
  })
}
