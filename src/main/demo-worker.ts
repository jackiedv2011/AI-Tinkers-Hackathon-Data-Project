const allocations: Buffer[] = []
const allocation = Buffer.alloc(160 * 1024 * 1024, 7)
allocations.push(allocation)

if (process.send) process.send({ type: 'ready', pid: process.pid })

process.on('message', (message: { type?: string }) => {
  if (message?.type === 'shutdown') {
    allocations.splice(0)
    setTimeout(() => process.exit(0), 250)
  }
})

setInterval(() => undefined, 1000)
