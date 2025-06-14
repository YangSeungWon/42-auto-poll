import redis from './redis-wrapper.js';

const POLL_KEY = 'current_poll';

export class Poll {
    static async start(options = []) {
        const payload = {
            options,
            votes: {},
            startedAt: Date.now()
        };
        await redis.set(POLL_KEY, JSON.stringify(payload));
    }

    static async isActive() {
        return (await redis.exists(POLL_KEY)) === 1;
    }

    static async vote(userId, option) {
        const data = await this._get();
        if (!data) throw new Error('No active poll');
        data.votes[userId] = option;
        await redis.set(POLL_KEY, JSON.stringify(data));
    }

    static async end() {
        const data = await this._get();
        if (!data) throw new Error('No active poll');
        await redis.del(POLL_KEY);
        return this._tally(data);
    }

    static async _get() {
        const raw = await redis.get(POLL_KEY);
        return raw ? JSON.parse(raw) : null;
    }

    static _tally(data) {
        const tally = {};
        const voterCount = Object.keys(data.votes).length;
        for (const option of data.options) {
            tally[option] = 0;
        }
        for (const vote of Object.values(data.votes)) {
            if (tally.hasOwnProperty(vote)) tally[vote] += 1;
        }
        
        // Sort by vote count (descending)
        const sortedResults = Object.entries(tally)
            .sort((a, b) => b[1] - a[1])
            .map(([option, count], index) => ({
                option,
                count,
                rank: index + 1,
                percentage: voterCount > 0 ? Math.round((count / voterCount) * 100) : 0
            }));
        
        return {
            options: data.options,
            votes: data.votes,
            tally,
            sortedResults,
            totalVoters: voterCount
        };
    }

    static async getCurrentStatus() {
        const data = await this._get();
        if (!data) return null;
        
        return {
            isActive: true,
            startedAt: data.startedAt,
            totalVoters: Object.keys(data.votes).length,
            options: data.options
            // Note: Not exposing real-time vote counts
        };
    }
} 