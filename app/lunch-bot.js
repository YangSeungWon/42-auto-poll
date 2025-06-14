import bolt from '@slack/bolt';
const { App } = bolt;
import schedule from 'node-schedule';
import dotenv from 'dotenv';
import { Poll } from './poll.js';
import { getRestaurants } from './restaurants.js';
import { query } from './database.js';

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
    console.log('=== 레스토랑 데이터 디버그 ===');
    console.log('Raw restaurants data:', restaurants);
    restaurants.forEach((r, idx) => {
        console.log(`Restaurant ${idx}:`, {
            id: r.id,
            name: r.name,
            nameLength: r.name.length,
            nameBytes: Buffer.from(r.name, 'utf8').length,
            nameEncoded: Buffer.from(r.name, 'utf8').toString('utf8')
        });
    });
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
        // Ensure proper UTF-8 encoding for button text
        const buttonText = Buffer.from(option, 'utf8').toString('utf8');
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: buttonText,
                        emoji: true
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

    const { sortedResults, totalVoters } = result;

    if (sortedResults.length === 0 || totalVoters === 0) {
        await app.client.chat.postMessage({
            channel: POLL_CHANNEL,
            text: '🍱 금요일 점심 투표 결과\n아무도 투표하지 않았습니다. 😢'
        });
        return;
    }

    const winner = sortedResults[0];
    let text = `*🍱 금요일 점심 투표 결과*\n\n🏆 **우승: ${winner.option}** (${winner.count}표, ${winner.percentage}%)\n\n📊 **전체 결과** (총 ${totalVoters}명 참여):`;

    sortedResults.forEach((result, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
        text += `\n${medal} ${result.rank}위. ${result.option}: ${result.count}표 (${result.percentage}%)`;
    });

    // Log detailed voting data for admin purposes (console only)
    console.log('=== 투표 상세 로그 ===');
    console.log('투표자별 선택:', result.votes);
    console.log('최종 집계:', result.tally);

    try {
        // Update winner's order count in database
        const restaurants = await getRestaurants();
        const winnerRestaurant = restaurants.find(r => r.name === winner.option);
        if (winnerRestaurant) {
            await query('UPDATE restaurants SET orders = orders + 1 WHERE id = ?', [winnerRestaurant.id]);
            console.log(`Updated order count for ${winner.option}`);
        }
    } catch (err) {
        console.error('Failed to update order count:', err);
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
        const [action, ...args] = text.split(' ');

        if (action === 'start') {
            if (await Poll.isActive()) {
                await respond('이미 진행 중인 투표가 있습니다.');
            } else {
                await postPoll();
                await respond('점심 투표를 시작했습니다!');
            }
        } else if (action === 'end') {
            if (!(await Poll.isActive())) {
                await respond('진행 중인 투표가 없습니다.');
            } else {
                await endPoll();
                await respond('투표를 마감했습니다.');
            }
        } else if (action === 'status') {
            try {
                const status = await Poll.getCurrentStatus();
                if (!status) {
                    await respond('현재 진행 중인 투표가 없습니다.');
                } else {
                    const startTime = new Date(status.startedAt).toLocaleTimeString('ko-KR');
                    const optionsList = status.options.map(opt => `• ${opt}`).join('\n');
                    await respond(`📊 **투표 진행 중**\n시작 시간: ${startTime}\n참여자 수: ${status.totalVoters}명\n\n**투표 옵션:**\n${optionsList}\n\n💡 투표 결과는 마감 후 공개됩니다.`);
                }
            } catch (err) {
                console.error('Failed to get poll status:', err);
                await respond('❌ 투표 상태 조회 중 오류가 발생했습니다.');
            }
        } else if (action === 'add') {
            const restaurantName = args.join(' ').trim();
            if (!restaurantName) {
                await respond('사용법: /lunch add [음식점명]');
                return;
            }
            try {
                await query('INSERT INTO restaurants (name) VALUES (?)', [restaurantName]);
                await respond(`✅ "${restaurantName}" 음식점이 추가되었습니다!`);
            } catch (err) {
                console.error('Failed to add restaurant:', err);
                await respond('❌ 음식점 추가 중 오류가 발생했습니다.');
            }
        } else if (action === 'list') {
            try {
                const restaurants = await getRestaurants();
                const list = restaurants.map(r => `• ${r.name}`).join('\n');
                await respond(`현재 등록된 음식점:\n${list}`);
            } catch (err) {
                await respond('❌ 음식점 목록 조회 중 오류가 발생했습니다.');
            }
        } else {
            await respond('사용법: /lunch [start|end|status|add|list]\n• start: 투표 시작\n• end: 투표 마감\n• status: 투표 상태\n• add [음식점명]: 새 음식점 추가\n• list: 등록된 음식점 목록');
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