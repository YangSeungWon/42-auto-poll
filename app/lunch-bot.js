import bolt from '@slack/bolt';
const { App } = bolt;
import schedule from 'node-schedule';
import dotenv from 'dotenv';
import { Poll } from './poll.js';
import { getRestaurants } from './restaurants.js';

dotenv.config();

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    port: process.env.PORT || 3000
});

const POLL_CHANNEL = process.env.LUNCH_CHANNEL_ID;
const MEMBER_CHANNEL = process.env.LUNCH_MEMBER_CHANNEL_ID || POLL_CHANNEL;

let BOT_USER_ID;

async function ensureBotUserId() {
    if (!BOT_USER_ID) {
        const auth = await app.client.auth.test();
        BOT_USER_ID = auth.user_id;
    }
}

async function pickOrderers() {
    await ensureBotUserId();
    // Fetch channel members
    const { members } = await app.client.conversations.members({
        channel: MEMBER_CHANNEL
    });
    // Exclude bot
    const humanMembers = members.filter((id) => id !== BOT_USER_ID);
    // Shuffle
    for (let i = humanMembers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [humanMembers[i], humanMembers[j]] = [humanMembers[j], humanMembers[i]];
    }
    return humanMembers.slice(0, 2);
}

async function postPoll() {
    const restaurants = await getRestaurants();
    const options = restaurants.map((r) => r.name);
    await Poll.start(options);

    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '*🍽️ 금요일 점심 투표가 시작되었습니다!*\n아래 옵션 중 선택해주세요.'
            }
        },
        { type: 'divider' }
    ];

    options.forEach((option, idx) => {
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: option
                    },
                    action_id: `vote_${idx}`
                }
            ]
        });
    });

    const [primary, secondary] = await pickOrderers();

    await app.client.chat.postMessage({
        channel: POLL_CHANNEL,
        text: '금요일 점심 투표가 시작되었습니다!',
        blocks
    });

    await app.client.chat.postMessage({
        channel: POLL_CHANNEL,
        text: `*주문 담당자*\n1차: <@${primary}>\n2차: <@${secondary}>`
    });
}

async function endPoll() {
    if (!(await Poll.isActive())) return;
    const result = await Poll.end();

    // Determine winning option
    const sorted = Object.entries(result.tally).sort((a, b) => b[1] - a[1]);
    const [winner, winnerVotes] = sorted[0];

    let text = `*🍱 금요일 점심 투표 결과*\n우승: *${winner}* (${winnerVotes}표)\n\n전체 득표수:`;
    for (const [opt, cnt] of sorted) {
        text += `\n• ${opt}: ${cnt}`;
    }

    await app.client.chat.postMessage({
        channel: POLL_CHANNEL,
        text
    });
}

function registerVoteActions() {
    // Using generic regex to match action ids
    app.action(/vote_\d+/, async ({ body, ack, action }) => {
        await ack();
        const userId = body.user.id;
        const optionIdx = Number(action.action_id.split('_')[1]);
        const active = await Poll.isActive();
        if (!active) {
            await app.client.chat.postEphemeral({
                channel: POLL_CHANNEL,
                user: userId,
                text: '투표가 이미 종료되었습니다.'
            });
            return;
        }
        const restaurants = await getRestaurants();
        const option = restaurants[optionIdx].name;
        await Poll.vote(userId, option);
        await app.client.chat.postEphemeral({
            channel: POLL_CHANNEL,
            user: userId,
            text: `*${option}* 에 투표 완료!`
        });
    });
}

function registerSlashCommands() {
    app.command('/lunch', async ({ command, ack, respond }) => {
        await ack();
        const text = command.text.trim();
        if (text === 'start') {
            if (await Poll.isActive()) {
                await respond('이미 진행 중인 투표가 있습니다.');
            } else {
                await postPoll();
                await respond('점심 투표를 시작했습니다!');
            }
        } else if (text === 'end') {
            if (!(await Poll.isActive())) {
                await respond('진행 중인 투표가 없습니다.');
            } else {
                await endPoll();
                await respond('투표를 마감했습니다.');
            }
        } else if (text === 'status') {
            const active = await Poll.isActive();
            await respond(active ? '투표가 진행 중입니다.' : '현재 진행 중인 투표가 없습니다.');
        } else {
            await respond('사용법: /lunch [start|end|status]');
        }
    });
}

function scheduleJobs() {
    // At 09:00 every Friday Asia/Seoul
    schedule.scheduleJob({ tz: process.env.TZ || 'Asia/Seoul', rule: '0 9 * * 5' }, async () => {
        await postPoll();
    });
    // At 10:00 every Friday
    schedule.scheduleJob({ tz: process.env.TZ || 'Asia/Seoul', rule: '0 10 * * 5' }, async () => {
        await endPoll();
    });
}

async function joinChannel(channelId) {
    try {
        await app.client.conversations.join({ channel: channelId });
        console.log(`Joined channel ${channelId}`);
    } catch (err) {
        if (err.data?.error === 'method_not_supported_for_channel_type') {
            // cannot join DM or similar, ignore
            return;
        }
        if (err.data?.error !== 'already_in_channel') {
            console.error('Failed to join channel', channelId, err.data?.error || err);
        }
    }
}

(async () => {
    registerVoteActions();
    registerSlashCommands();
    // Ensure bot joins necessary channels
    await joinChannel(POLL_CHANNEL);
    if (POLL_CHANNEL !== MEMBER_CHANNEL) {
        await joinChannel(MEMBER_CHANNEL);
    }
    scheduleJobs();
    await app.start();
    console.log('⚡️ Friday Lunch Bot is running');
})(); 