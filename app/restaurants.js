import { query } from './database.js';

export async function getRestaurants() {
    return await query('SELECT id, name FROM restaurants WHERE active = 1');
}

export async function incrementOrderCount(restaurantId) {
    return await query('UPDATE restaurants SET orders = orders + 1 WHERE id = ?', [restaurantId]);
} 