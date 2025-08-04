
export function saveGameToStorage(game) {
  const key = 'games-' + game.date;
  const data = localStorage.getItem(key);
  const games = data ? JSON.parse(data) : [];
  games.push(game);
  localStorage.setItem(key, JSON.stringify(games));
}

export function getGamesByDate(date) {
  const key = 'games-' + date;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}
