// providers/viu.js - Test Provider
module.exports = {
  id: 'nuvio-viu',
  name: 'Viu',
  getStreams: async () => {
    return [
      {
        server: 'Viu TEST',
        name: 'Viu Test Server',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        quality: 'Auto',
        format: 'm3u8'
      }
    ];
  }
};
