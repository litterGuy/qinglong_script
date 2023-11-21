/**
 * @author Telegram@sudojia
 * @site https://blog.imzjw.cn
 * @date 2022/01/19 21:26
 * @last Modified by Telegram@sudojia
 * @last Modified time 2022/01/21 20:37
 * @description 掘金自动签到
 */
const $ = new Env('掘金自动签到');
const notify = $.isNode() ? require('./sendNotify') : '';
let JUEJIN_COOKIE = process.env.JUEJIN_COOKIE, cookie = '', cookiesArr = [], message = '';

// ENABLE_TEN_DRAW: 是否开启十连抽, 默认不开启十连抽, true: 开启十连抽
// TEN_DRAW_NUM: 十连抽次数, 默认一次十连抽
let enableTenDraw = false, tenDrawNum = 1;

// TODO 目前十连抽默认所有账号都十连抽、未实现控制哪个账号执行十连抽, 我想到的思路比较烂, 如果你有更好的思路, 欢迎 Telegram@sudojia 或者 PR
if (process.env.ENABLE_TEN_DRAW) {
    enableTenDraw = process.env.ENABLE_TEN_DRAW
}
if (process.env.TEN_DRAW_NUM) {
    tenDrawNum = process.env.TEN_DRAW_NUM;
}

const JUEJIN_API = 'https://api.juejin.cn';

if (JUEJIN_COOKIE.indexOf('&') > -1) {
    cookiesArr = JUEJIN_COOKIE.split('&');
} else {
    cookiesArr = [JUEJIN_COOKIE];
}

!(async () => {
    if (!JUEJIN_COOKIE) {
        console.log('请设置环境变量【JUEJIN_COOKIE】')
        return;
    }
    if (!enableTenDraw) {
        console.log(`如需执行十连抽请设置环境变量【ENABLE_TEN_DRAW】为 true 和【TEN_DRAW_NUM】十连抽次数\n`);
    }
    for (let i = 0; i < cookiesArr.length; i++) {
        if (cookiesArr[i]) {
            cookie = cookiesArr[i];
            $.index = i + 1;
            // 默认 Cookie 未失效
            $.isLogin = true;
            // 默认今日未签到
            $.isSignIn = false;
            // 免费抽奖次数
            $.freeCount = 0;
            // 账号总矿石数
            $.oreNum = 0;
            // 检测状态 (今日是否签到、Cookie 是否失效)
            await checkStatus();
            console.log(`\n*****开始第【${$.index}】个账号****\n`);
            message += `📣==========掘金账号${$.index}==========📣\n`;
            if (!$.isLogin) {
                await notify.sendNotify(`「掘金签到报告」`, `掘金账号${$.index} Cookie已失效，请重新登录获取Cookie`);
            }
            await main();
            await $.wait(2000);
        }
    }
    if (message) {
        await notify.sendNotify(`「掘金签到报告」`, `${message}`);
    }
})().catch((e) => {
    $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
}).finally(() => {
    $.done();
});

async function main() {
    await getUserName();
    await $.wait(1000);
    if (!$.isSignIn) {
        await checkIn();
        await $.wait(1000);
        await getCount();
    } else {
        console.log(`您今日已完成签到，请勿重复签到~\n`);
    }
    await queryFreeLuckyDrawCount();
    await $.wait(1000);
    if ($.freeCount > 0) {
        // 目前只利用签到所获取的抽奖次数进行抽奖！
        await luckyDraw();
    } else {
        console.log(`今日免费抽奖次数已用尽!\n`);
    }
    await $.wait(1000);
    await getOreNum();
    await $.wait(1000);
    if (enableTenDraw) {
        console.log(`检测到你已开启十连抽，正在为你执行十连抽...`);
        for (let i = 0; i < tenDrawNum; i++) {
            await tenDraw();
            await $.wait(2000);
        }
    }
}

/**
 * 检测签到状态
 */
function checkStatus() {
    return new Promise((resolve) => {
        $.get(sendGet('growth_api/v1/get_today_status', ''), (err, response, data) => {
            try {
                if (err) {
                    console.log(`checkStatus API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    data = JSON.parse(data);
                    // 今日是否已签到 true: 已签到 false: 未签到
                    $.isSignIn = data.data;
                    if (403 === data.err_no) {
                        // Cookie 已失效
                        $.isLogin = false;
                    }
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}

/**
 * 签到函数
 *
 * @returns {*}
 */
function checkIn() {
    return new Promise((resolve) => {
        $.post(sendPost('growth_api/v1/check_in', ``), (err, response, data) => {
            try {
                if (err) {
                    console.log(`checkIn API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    data = JSON.parse(data);
                    // 签到所获取的矿石数
                    $.incrPoint = data.data.incr_point;
                    // 当前账号总矿石数
                    $.sumPoint = data.data.sum_point;
                    message += `【账号昵称】${$.userName}\n【签到状态】已签到\n【今日收入】${$.incrPoint}矿石数\n【总矿石数】${$.sumPoint}矿石数`
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}

/**
 * 抽奖函数
 * 目前已知奖品
 * lottery_id: 6981716980386496552、name: 66矿石、type: 1
 * lottery_id: 6981716405976743943、name: Bug、type: 2
 * lottery_id: 7020245697131708419、name: 掘金帆布袋、type: 4
 * lottery_id: 7017679355841085472、name: 随机限量徽章、type: 4
 * lottery_id: 6997270183769276416、name: Yoyo抱枕、type: 4
 * lottery_id: 7001028932350771203、name: 掘金马克杯、type: 4
 * lottery_id: 7020306802570952718、name: 掘金棒球帽、type: 4
 * lottery_id: 6981705951946489886、name: Switch、type: 3
 */
function luckyDraw() {
    return new Promise((resolve) => {
        $.post(sendPost('growth_api/v1/lottery/draw', ``), (err, response, data) => {
            try {
                if (err) {
                    console.log(`luckyDraw API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    data = JSON.parse(data);
                    console.log(`抽中了${data.data.lottery_name}\n`);
                    message += `\n【抽奖信息】抽中了${data.data.lottery_name}\n\n`;
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}

/**
 * 十连抽
 */
function tenDraw() {
    return new Promise((resolve) => {
        $.post(sendPost('growth_api/v1/lottery/ten_draw', ``), (err, response, data) => {
            try {
                if (err) {
                    console.log(`tenDraw API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    if (2000 > $.oreNum) {
                        console.log(`当前账号不足 2000 矿石数，十连抽失败~`)
                    } else {
                        // 单抽加 10 幸运值、十连抽加 100 幸运值，6000 满格
                        console.log(`本次十连抽共消耗 2000 矿石数\n十连抽奖励为: `)
                        data = JSON.parse(data);
                        $.lotteryBases = data.data.LotteryBases;
                        for (let draw of $.lotteryBases) {
                            console.log(`${draw.lottery_name}`)
                        }
                        let needOreNum = (6000 - data.data.total_lucky_value) / 100 * 2000;
                        console.log(`本次十连抽加${data.data.draw_lucky_value}幸运值`);
                        console.log(`当前总幸运值为${data.data.total_lucky_value}`);
                        console.log(`离幸运值满格还差${6000 - data.data.total_lucky_value}幸运值，所需${needOreNum}矿石数，还需十连抽${(6000 - data.data.total_lucky_value) / 100}次`);
                    }
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}

/**
 * 查询免费抽奖次数
 */
function queryFreeLuckyDrawCount() {
    return new Promise((resolve) => {
        $.get(sendGet('growth_api/v1/lottery_config/get', ``), (err, response, data) => {
            try {
                if (err) {
                    console.log(`queryFreeLuckyDrawCount API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    data = JSON.parse(data);
                    // 获取免费抽奖次数
                    $.freeCount = data.data.free_count;
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}

/**
 * 获取总账号矿石数
 */
function getOreNum() {
    return new Promise((resolve) => {
        $.get(sendGet('growth_api/v1/get_cur_point', ``), (err, response, data) => {
            try {
                if (err) {
                    console.log(`getOreNum API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    data = JSON.parse(data);
                    // 当前账号总矿石数
                    $.oreNum = data.data;
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}


/**
 * 获取昵称
 */
function getUserName() {
    return new Promise((resolve) => {
        $.get(sendGet('user_api/v1/user/get', ``), (err, response, data) => {
            try {
                if (err) {
                    console.log(`getUserName API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    data = JSON.parse(data);
                    $.userName = data.data.user_name;
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}

/**
 * 统计签到天数, 没什么用~
 */
function getCount() {
    return new Promise((resolve) => {
        $.get(sendGet('growth_api/v1/get_counts', ``), (err, response, data) => {
            try {
                if (err) {
                    console.log(`getCount API 请求失败\n${JSON.stringify(err)}`)
                } else {
                    data = JSON.parse(data);
                    message += `\n【签到统计】连签${data.data.cont_count}天、累签${data.data.sum_count}天`
                }
            } catch (err) {
                $.logErr(err, response);
            } finally {
                resolve();
            }
        })
    })
}

function sendGet(path, body) {
    return {
        url: `${JUEJIN_API}/${path}?body=${body}`,
        headers: {
            "Accept": "*/*",
            "Content-type": "application/json",
            "Referer": `${JUEJIN_API}`,
            "Cookie": `${cookie}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36"
        }
    }
}

function sendPost(path, body = {}) {
    return {
        url: `${JUEJIN_API}/${path}`,
        body: body,
        headers: {
            "Accept": "*/*",
            "Content-type": "application/json",
            "Referer": `${JUEJIN_API}`,
            "Cookie": `${cookie}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36"
        }
    }
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:i,...r}=t;this.got[s](i,r).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
