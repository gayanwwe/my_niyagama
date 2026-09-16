import net from 'net';
const client = net.createConnection({ port: 8000, host: '127.0.0.1' }, () => {
  console.log('Port 8000 is open');
  process.exit(0);
});
client.on('error', (err) => {
  console.error('Port 8000 is closed:', err.message);
  process.exit(1);
});
setTimeout(() => {
  console.error('Connection timed out');
  process.exit(1);
}, 2000);
