(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArcadeSocial = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function normalizeUsername(value) {
    return String(value || '').trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  }

  function canRequestFriend(username, currentUsername, friends, requests) {
    const target = normalizeUsername(username);
    if (target.length < 3 || target === normalizeUsername(currentUsername)) return false;
    if (friends.some(friend => normalizeUsername(friend.username) === target)) return false;
    return !requests.some(request => normalizeUsername(request.username) === target);
  }

  function respondToRequest(friends, requests, id, accept) {
    const request = requests.find(item => String(item.id) === String(id));
    if (!request) return { friends, requests, changed: false };
    const nextFriends = accept && !friends.some(friend => normalizeUsername(friend.username) === normalizeUsername(request.username))
      ? [...friends, { username: normalizeUsername(request.username), name: request.name || request.username, online: false }]
      : friends;
    return { friends: nextFriends, requests: requests.filter(item => String(item.id) !== String(id)), changed: true };
  }

  return { normalizeUsername, canRequestFriend, respondToRequest };
});
