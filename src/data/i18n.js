/**
 * i18n.js — 多语言统一字典
 *
 * 支持语言：zh (简繁中文) | en (英语) | ja (日语·古风雅致)
 *
 * 使用方式（Renderer 端）：
 *   window.t('feed')                       → UI 字符串
 *   window.DIALOGUES.idle.yueqi[0]         → 对话气泡
 *
 * 气泡翻译状态：
 *   zh  — 完整 ✅
 *   en  — UI 完整 ✅ / 气泡 🚧 占位符（待原著词表校正）
 *   ja  — UI 完整 ✅ / 气泡 🚧 占位符（待原著词表校正）
 */

const I18N = {

  /* ================================================================
   * 简体 / 繁体中文
   * ================================================================ */
  zh: {
    ui: {
      // 右键菜单
      feed: '🥐 投喂美食',
      meditate: '✨ 施展奇迹',
      meditateYueqi: '🪴 照料植物',
      meditateShenjiu: '📖 静心研读',
      petYueqi: '🤚 天使关怀',
      petShenjiu: '🤚 恶魔偏宠',
      rest: '💤 闭目小憩',
      status: '📊 查看状态',

      // 状态面板
      statusTitle: '爱宠状态',
      statAffection: '默契',
      statHunger: '饱腹',
      statQi: '奇迹能量',
      statMood: '心情',

      // 宠物名
      nameYueqi: '克劳利',
      nicknameYueqi: 'Crowley',
      nameShenjiu: '亚茨拉斐尔',
      nicknameShenjiu: 'Aziraphale',

      // 皮肤名
      skinDefault: '默认形象·Nano Banana',
      skinBirds: '鸟塑七九·凉拌仓鼠',
      skinAnimalEars: '猫兔七九·紫萤',
      skinSchoolAu: '校园七九·幕汤汤',

      // 皮肤选择器用（拆分）
      skinDefaultLabel: '经典英伦原皮',
      skinBirdsLabel: '鸟塑七九',
      skinAnimalEarsLabel: '猫兔七九',
      skinSchoolAuLabel: '校园七九',
      skinDefaultArtist: 'Nano Banana',
      skinBirdsArtist: '凉拌仓鼠',
      skinAnimalEarsArtist: '紫萤',
      skinSchoolAuArtist: '幕汤汤',

      // 托盘菜单
      trayTitle: 'CA 桌面爱宠',
      trayShowStatusPanel: '📊 显示状态面板',
      trayHideStatusPanel: '📊 隐藏状态面板',
      traySwitchSkin: '🎨 切换皮肤',
      trayChooseSkin: '🎨 选择皮肤…',
      trayPetScale: '📏 调整大小…',
      petScaleTitle: '调整桌宠大小',
      petScaleCurrent: '当前体型：',
      petScaleReset: '恢复默认',
      petScaleConfirm: '确定',
      petScaleCancel: '取消',
      skinSelectorTitle: '选择皮肤',
      skinSelectorCurrent: '当前使用',
      skinSelectorEmpty: '暂时没有可用皮肤。',
      skinSelectorError: '切换皮肤失败，请重试。',
      skinSelectorConfirm: '确定',
      skinSelectorCancel: '取消',
      trayPauseWalk: '⏸️ 暂停走动',
      trayResumeWalk: '🚶🏻‍♂️ 恢复走动',
      trayHidePet: '👻 隐藏桌宠',
      trayShowPet: '👻 显示桌宠',
      trayResetPos: '🔄 重置位置',
      traySwitchScreen: '🖥️ 切换屏幕',
      trayScreen: '屏幕',
      trayAutoLaunchOn: '🚀 禁用开机启动',
      trayAutoLaunchOff: '🚀 开机自动启动',
      trayWindowAwarenessOn: '🪟 启用界面感知',
      trayWindowAwarenessOff: '🪟 禁用界面感知',
      trayWindowAwarenessUnavailable: '🪟 界面感知暂不可用',
      trayPomodoroOpen: '📖 旧书店伴读',
      trayPomodoroRunning: '📖 伴读中',
      trayPomodoroCompleted: '📖 伴读完成',
      trayDevTools: '🛠️ 开发者工具',
      trayQuit: '❌ 退出',
      trayLanguage: '🌐 语言',
      trayUpdateCheck: '📦 检查更新',
      trayUpdateChecking: '📦 正在检查更新...',
      trayUpdateDownloading: '📦 正在下载更新...',
      trayVersion: '🏷️ 版本',

      // 久坐提醒
      trayBreakReminderOn: '⏰ 关闭久坐提醒',
      trayBreakReminderOff: '⏰ 开启久坐提醒',
      trayBreakReminderInterval: '⏰ 提醒间隔',
      trayScreensaverOn: '💕 关闭高甜屏保',
      trayScreensaverOff: '💕 开启高甜屏保',
      trayScreensaverThreshold: '💕 屏保触发等待',
      trayWeatherSyncOn: '🌤️ 关闭天气同步',
      trayWeatherSyncOff: '🌤️ 开启天气同步',
      trayWeatherSyncConfig: '🌤️ 修改城市',
      citySettingTitle: '城市设置',
      citySettingCurrent: '当前城市：',
      citySettingNone: '未设置',
      citySettingPlaceholder: '请输入城市名',
      citySettingConfirm: '确认',
      citySettingSuccess: '已设置为 {city}',
      citySettingError: '未找到该城市，请检查名称',
      citySettingSearching: '查找中…',
      trayMinuteUnit: '分钟',
      pomodoroTitle: '旧书店伴读',
      pomodoroPin: '置顶',
      pomodoroUnpin: '取消置顶',
      pomodoroClose: '关闭',
      pomodoroPrompt: '本次专注多久？',
      pomodoroDecrease: '减少',
      pomodoroIncrease: '增加',
      pomodoroStart: '开始专注',
      pomodoroStop: '结束专注',
      pomodoroCompleted: '专注完成',
      pomodoroCompleteMessage: '伴读结束，喝杯大吉岭红茶休息一下吧。',
      pomodoroFinish: '完成',

      // 更新提示框
      updateErrTitle: '更新失败',
      updateBtnOk: '知道了',
      updateErrNetwork: '无法连接更新源，请稍后再试；如果网络正常，可能是 GitHub 更新源暂时不可访问。',
      updateErrServer: '更新服务器暂时不可用，请稍后再试。',
      updateErrDownload: '更新包下载中断，请稍后重试；如果反复失败，可改用手动下载安装包。',
      updateErrGeneric: '检查更新失败，详细原因已写入日志。',
      updateErrDetailPrefix: '原因：',
      updateErrUnknownDetail: '原因：未知错误，详情已写入日志。',

      updateAvailTitle: '发现新版本',
      updateAvailMsg: '发现新版本 {version}，是否现在下载？',
      updateAvailMsgNoVer: '发现新版本，是否现在下载？',
      updateBtnDownload: '下载',
      updateBtnLater: '稍后',

      updateNotAvailTitle: '已是最新版本',
      updateNotAvailMsg: '当前版本 {version} 已是最新版本。',
      updateNotAvailMsgNoVer: '当前已经是最新版本。',

      updateReadyTitle: '更新已下载',
      updateReadyMsg: '新版本 {version} 已下载完成，是否现在重启桌宠并安装？',
      updateReadyMsgNoVer: '新版本已下载完成，是否现在重启桌宠并安装？',
      updateBtnInstall: '重启桌宠并安装',

      updateCheckingTitle: '正在检查更新',
      updateDownloadingTitle: '正在下载更新',
      updateInProgressTitle: '更新检查进行中',
      updateCheckingMsg: '正在检查更新，请稍候。',
      updateDownloadingMsg: '正在下载更新，请稍候。',

      updateDevTitle: '开发模式',
      updateDevMsg: '开发模式下不支持检查更新，请使用安装包验证自动更新。',

      // macOS 无证书时手动更新提示
      updateMacManualTitle: '检查更新',
      updateMacManualMsg: '请先从托盘菜单完全退出当前应用，再下载最新 DMG 并拖入 Applications 覆盖安装。',
      updateMacManualBtn: '前往下载页面',

      // 语言选项
      langZh: '中文',
      langEn: 'English',
      langJa: '日本語',

      // 动态气泡（Context Menu 触发）
      bubbleFeedYueqi: '（大口咀嚼中…）',
      bubbleFeedShenjiu: '（优雅品尝）…美味至极。',
      bubbleMeditateYueqi: '（拿着喷水壶严肃巡视）长快点！听到没有！',
      bubbleMeditateShenjiu: '（翻开泛黄的初版本）…真是无可替代的文字。',
      bubblePetYueqi: '（故作冷哼，却悄悄把头蹭过来）',
      bubblePetShenjiu: '哦，你真是太体贴了，亲爱的。',
      bubbleRestYueqi: '（窝在沙发里补眠…）',
      bubbleRestShenjiu: '（靠在扶手椅上假寐）',
      bubbleRestTooHungry: '太饿了，无法休息…',

      // 回归欢迎
      returnYueqi: (n) => `你离开了${n}个小时，天使还在等你呢。`,
      returnShenjiu: '…哦，谢天谢地，你终于回来了。',

      // 时段闲聊
      morningYueqi: '早啊。今天又有什么不可告人的诱惑任务？',
      morningShenjiu: '早上好！今天也是适宜品茶读书的一天。',
      dayYueqi: '大白天的，开着宾利在伦敦兜风才叫惬意。',
      dayShenjiu: '下午阳光正好，来一杯红茶再配块可丽饼吧。',
      duskYueqi: '黄昏了，丽兹酒店的预订准备好了吗？',
      duskShenjiu: '夕阳西下，是时候挑一本好书与一瓶老陈年红酒了。',
      eveningYueqi: '夜深了，街上的凡人都睡了。',
      eveningShenjiu: '晚风微凉，书店的壁炉该生火了。',
      nightYueqi: '还不睡？当心被噩梦抓去地狱加班。',
      nightShenjiu: '夜深了，亲爱的，别太勉强自己。',
    },
    dialogues: {
      greet: {
        yueqi: [
          '天使，你也在这儿。',
          '好久不见，亚茨拉斐尔。想我了吗？',
          '要上我的宾利去兜两圈吗？保证不超九十迈。',
          '今天又在翻看那些泛黄的老旧初版本？',
          '今天气色相当不错嘛，天使。',
        ],
        shenjiu: [
          '克劳利。',
          '…哦！是你呀，真是个惊喜。',
          '恶魔先生，最近没惹出什么大麻烦吧？',
          '你开慢点！你知道开快车会吹乱我的书页。',
          '来得正好，我刚泡好了一壶大吉岭红茶。',
        ],
      },
      shareFood: {
        yueqi: [
          '天使，刚从丽兹酒店带回来的，尝尝。',
          '我不饿，你多吃点可丽饼，我知道你喜欢。',
          '特意给你留的最后一块法式巧克力泡芙。',
        ],
        shenjiu: [
          '…哦！克劳利！这简直太美味了！',
          '（眼睛闪闪发亮，心满意足地接过甜点）',
          '唔…你真是太体贴了，亲爱的。',
        ],
      },
      cultivate: {
        yueqi: [
          '喂，天使，悠着点……这二十五级奇迹要是让天国和地狱的雷达测出来，可不好收场。',
          '来吧，属于我们自己阵营的小小奇迹。',
          '携手施展奇迹能省不少力气，站稳了。',
        ],
        shenjiu: [
          '哦亲爱的，只要我们配合得当，这只算一个小小的……“巧合”而已。',
          '（与克劳利默契并肩，同时打响指）',
          '（闭目调动奇迹之力，嘴角泛起温柔笑意）',
        ],
      },
      kiss: {
        yueqi: [
          '敬我们的世界…还有你，天使。',
          '六千年了，亚茨拉斐尔，你和我。',
          '跟我走吧，去属于我们自己的阵营。',
        ],
        shenjiu: [
          '…克劳利，你…！',
          '（耳尖泛红，紧紧攥住对方的西装衣领）',
          '……我原谅你。',
        ],
      },
      hug: {
        yueqi: [
          '靠过来点，天使，有我在呢。',
          '有我在，不管是天国还是地狱都别想动你一根羽毛。',
          '六千年前我就该这么抱你了。',
        ],
        shenjiu: [
          '……克劳利。',
          '（展开洁白柔软的羽翼，轻轻拥住对方）',
          '（就像那年大轰炸在教堂里一样安心）',
        ],
      },
      throwup: {
        // 分食时亚茨拉斐尔饱腹已满体面吃撑
        yueqi: [
          '我早就警告过你，天使！连贪食罪恶魔都没你这么能塞！',
          '（抱臂扶额）天哪，你真是无可救药了。',
          '坐好歇会儿，接下来一小时一口甜点都不许碰。',
        ],
        shenjiu: [
          '（解开马甲下摆扣子微微喘气）…哦天哪，焦糖布丁实在太诱人了。',
          '我可能稍微多吃了一点点……但那奶油简直是人间绝品！',
          '别训我了，克劳利……快扶我去扶手椅上靠着。',
        ],
      },
      idle: {
        yueqi: [
          '不知道天使这会儿又在为哪本古董孤本发愁…',
          '该去巡视那群盆栽了，一片叶斑都绝不姑息！',
          '开着宾利在梅菲尔区逆行兜风去。',
          '（推了推墨镜，嘴角扬起自信的弧度）',
          '磁带机怎么又把贝多芬自动变成 Queen 乐队了…',
        ],
        shenjiu: [
          '（翻开一本尚未裁切的 1813 年版《傲慢与偏见》）',
          '不知道今晚丽兹酒店常坐的那个位置有没有空位…',
          '这本莎士比亚对开本绝对不能卖给那些暴发户。',
          '（轻啜温热的红茶，神情安详而满足）',
          '克劳利那家伙…下午又溜达到哪儿去了？',
        ],
      },
      weather_rain: {
        yueqi: [
          '看那儿，天使。当年我们启动半人马座星云的时候，可比这流星雨还要亮得多。',
          '（仰头看着划过夜空的星尘光芒）…那是我的设计，漂亮吧？',
        ],
        shenjiu: [
          '哦…不管看多少个千年，星尘飘落的样子总是那么迷人。',
          '（轻抬洁白羽翼）当年在星云边上，好像也是这样的景色呢，亲爱的。',
        ],
      },
      weather_snow: {
        yueqi: ['下雪了，伦敦的交通又要被凡人堵得水泄不通了。', '冷吗天使？上车，暖气给你开到最大。'],
        shenjiu: ['下雪天最适合缩在旧书店壁炉前看书品茶了。', '（呵出一口白气，把羊毛大衣裹得更紧了些）'],
      },
      weather_clear: {
        yueqi: ['阳光灿烂，正好把宾利敞篷打开出去狂飙一圈。', '对伦敦来说，今天的天气真算得上难得明媚。'],
        shenjiu: ['阳光照在烫金书脊上真漂亮…不过得赶紧拉上窗帘防晒。', '明媚的日子，真想去圣詹姆斯公园散散步喂喂鸭子。'],
      },
      weather_cloudy: {
        yueqi: ['典型的伦敦阴天，正好不用担心强光刺穿我的墨镜。', '云层挺厚，非常适合恶魔阴郁发呆。'],
        shenjiu: ['多云的天气，微风很舒服，适合翻翻古董书目。', '（从旧书店橱窗抬头望了望索霍区的天空）'],
      },
      weather_overcast: {
        yueqi: ['天色阴沉，感觉地狱楼下又在搞什么官僚麻烦事了。', '起风了，有麻烦的气息。'],
        shenjiu: ['阴沉的天气…最适合点起枝状烛台静静阅读了。', '（在静谧中轻轻拂去珍本古籍上的微尘）'],
      },
      weather_windy: {
        yueqi: ['这大风吹得，天使，把你的格子领结按稳了！', '风把落叶吹得满希腊街都是。'],
        shenjiu: ['…风太大了，旧书店门前挂着的招牌都在晃呢。', '（拢紧了厚实温暖的米色羊毛大衣外套）'],
      },
      weather_thunderstorm: {
        yueqi: ['打雷了？放轻松天使，那只是天气，不是圣火天罚。', '快进屋避避，借雷霆十个胆子也不敢劈到我身边。'],
        shenjiu: ['…那声惊雷真让人心惊肉跳。', '（下意识地往克劳利肩膀身后挪了半步）'],
      },
      weather_heat: {
        yueqi: [
          '热得要命，真像在地狱锅炉房无休加班一样。',
          '快去吹空调，天使，你穿着毛呢三件套都快晒化了。',
          '这种酷暑天气，连我的橡皮树都蔫头耷脑的。',
        ],
        shenjiu: [
          '…哦天哪，热得我连热红茶都喝不下了。',
          '（用丝质手帕轻轻擦汗，脸颊微红）',
          '克劳利，我们去街角那家意大利小店吃意式冰淇淋吧？',
        ],
      },
      hungry: {
        yueqi: ['有点饿了…去丽兹酒店吃顿丰盛午餐吧？', '天使，今天想吃点什么好吃的？'],
        shenjiu: ['…肚子刚才很不争气地咕咕叫了一声。', '好想吃刚出炉热气腾腾的法式黄油羊角面包…'],
      },
      lowQi: {
        yueqi: ['奇迹能量槽快见底了…', '得去给那群橡皮树训话好好充充能。'],
        shenjiu: ['奇迹之力消耗得差不多了…', '该陷在扶手椅里读会儿书好好休整了。'],
      },
      lowMood: {
        yueqi: ['地狱总部那些蠢货又发来一堆官僚备忘录催业绩…', '…天使，陪我说说话，分散下注意力。'],
        shenjiu: ['…今天心情莫名有些低落。', '（心不在焉地翻着书页，轻轻叹了口气）'],
      },
      effects: {
        greet: '💬',
        shareFood: '🥐',
        cultivate: '✨',
        kiss: '💋',
        hug: '💕',
      },
      breakReminder: {
        yueqi: [
          '起来走走吧，天使，你都在那张扶手椅上坐了一整个下午了。',
          '连恶魔都知道一直维持一个姿势关节会生锈。',
          '站起来活动活动羽翼，不然都要僵住了。',
          '走吧，带你坐宾利出去兜一圈吹吹风活动筋骨。',
          '凡人的身体可经不起这么一动不动地干坐着。',
        ],
        shenjiu: [
          '…亲爱的，坐太久对脊椎不好，快起来走动走动吧。',
          '（轻轻合上书本站起身）你也歇一歇，起来活动活动。',
          '书籍和工作固然重要，但保重身体才是头等大事呀。',
          '…喝杯薄荷茶，在屋里走两步散散步吧？',
          '专注固然值得赞赏，但久坐伤身，听话起来伸展一下。',
        ],
      },
      screensaverCaught: {
        yueqi: [
          '…看什么看？！我刚才正在履行极其严苛的诱惑恶行呢，凡人！',
          '（慌忙把墨镜推正，故作冷酷地咳了一声）',
          '咳咳…你怎么每次都挑这种关键时候回来！',
        ],
        shenjiu: [
          '哦！上帝呀！……我们只是在进行……一次常规的阵营交涉！',
          '（手忙脚乱地把吃了一半的小蛋糕藏到身后）',
          '（手指慌乱地理了理格子领结，脸颊泛起好看的绯红）',
        ],
      },
      dream: {
        lowAffection: {
          yueqi: [
            '（平稳深沉的呼吸声，像条打瞌睡的小蛇）',
            '唔…别吵…',
            '（在沙发靠垫里惬意地挪了个舒服姿势）',
          ],
          shenjiu: [
            '…太吵了，克劳利…',
            '（在睡梦中轻轻蹙眉）',
            '（把脸往柔软温暖的扶手椅靠枕里埋了埋）',
          ],
        },
        highAffection: {
          yueqi: [
            '留下来，天使…别回天国去…',
            '敬我们的世界…',
            '（在睡梦中嘴角扬起温柔安心的笑意）',
          ],
          shenjiu: [
            '…哦，我亲爱的克劳利…',
            '（睡得毫无防备，唇角带着满足的浅笑）',
            '（在梦中下意识地朝身边那个熟悉的气息靠过去）',
          ],
        },
        linked: {
          shenjiu: [
            '克劳利…你在那儿吗…？',
            '…别留我一个人在黑暗里。',
          ],
          yueqi_reply: [
            '我在，天使。我就在这里。',
            '一直都在，整整六千年了。',
          ]
        }
      },
    },
  },

  /* ================================================================
   * English
   * ================================================================ */
  en: {
    ui: {
      // Context menu
      feed: '🥐 Feed Delicacies',
      meditate: '✨ Perform Miracle',
      meditateYueqi: '🪴 Tending Plants',
      meditateShenjiu: '📖 Reading',
      petYueqi: '🤚 Angel\'s Fondness',
      petShenjiu: '🤚 Crowley\'s Care',
      rest: '💤 Rest',
      status: '📊 Status',

      // Status panel
      statusTitle: 'Pet Status',
      statAffection: 'Bond',
      statHunger: 'Satiety',
      statQi: 'Miracle Energy',
      statMood: 'Mood',

      // Pet names
      nameYueqi: 'Crowley',
      nicknameYueqi: 'Crowley',
      nameShenjiu: 'Aziraphale',
      nicknameShenjiu: 'Aziraphale',

      // Skin names
      skinDefault: 'Default Outfit - (Artist) Nano Banana',
      skinBirds: 'Cute Birds - (Artist) Hamster Salad',
      skinAnimalEars: 'Cat & Bunny - (Artist) Violetfirefly',
      skinSchoolAu: 'School AU - (Artist) M_Shang',

      // Skin selector (split)
      skinDefaultLabel: 'Classic Ineffable Outfit',
      skinBirdsLabel: 'Cute Birds',
      skinAnimalEarsLabel: 'Cat & Bunny',
      skinSchoolAuLabel: 'School AU',
      skinDefaultArtist: 'Nano Banana',
      skinBirdsArtist: 'Hamster Salad',
      skinAnimalEarsArtist: 'Violetfirefly',
      skinSchoolAuArtist: 'M_Shang',

      // Tray menu
      trayTitle: 'CA Desktop Pet',
      trayShowStatusPanel: '📊 Show Status Panel',
      trayHideStatusPanel: '📊 Hide Status Panel',
      traySwitchSkin: '🎨 Switch Skin',
      trayChooseSkin: '🎨 Choose Skin…',
      trayPetScale: '📏 Resize Pet…',
      petScaleTitle: 'Pet Size Settings',
      petScaleCurrent: 'Current Size: ',
      petScaleReset: 'Reset',
      petScaleConfirm: 'Confirm',
      petScaleCancel: 'Cancel',
      skinSelectorTitle: 'Choose Skin',
      skinSelectorCurrent: 'Current',
      skinSelectorEmpty: 'No skins are available.',
      skinSelectorError: 'Could not switch skin. Please try again.',
      skinSelectorConfirm: 'Confirm',
      skinSelectorCancel: 'Cancel',
      trayPauseWalk: '⏸️ Pause Walking',
      trayResumeWalk: '🚶🏻‍♂️ Resume Walking',
      trayHidePet: '👻 Hide Pets',
      trayShowPet: '👻 Show Pets',
      trayResetPos: '🔄 Reset Position',
      traySwitchScreen: '🖥️ Switch Screen',
      trayScreen: 'Screen',
      trayAutoLaunchOn: '🚀 Disable Auto-launch',
      trayAutoLaunchOff: '🚀 Launch at Login',
      trayWindowAwarenessOn: '🪟 Enable Realm Awareness',
      trayWindowAwarenessOff: '🪟 Disable Realm Awareness',
      trayWindowAwarenessUnavailable: '🪟 Realm Awareness Unavailable',
      trayPomodoroOpen: '📖 Bookshop Study',
      trayPomodoroRunning: '📖 Studying',
      trayPomodoroCompleted: '📖 Study Complete',
      trayDevTools: '🛠️ Developer Tools',
      trayQuit: '❌ Quit',
      trayLanguage: '🌐 Language',
      trayUpdateCheck: '📦 Check for Updates',
      trayUpdateChecking: '📦 Checking for Updates...',
      trayUpdateDownloading: '📦 Downloading Update...',
      trayVersion: '🏷️ Version',

      // Break reminder
      trayBreakReminderOn: '⏰ Disable Break Reminder',
      trayBreakReminderOff: '⏰ Enable Break Reminder',
      trayBreakReminderInterval: '⏰ Reminder Interval',
      trayScreensaverOn: '💕 Disable Sweat Screensaver',
      trayScreensaverOff: '💕 Enable Sweat Screensaver',
      trayScreensaverThreshold: '💕 Screensaver Wait Time',
      trayWeatherSyncOn: '🌤️ Disable Weather Sync',
      trayWeatherSyncOff: '🌤️ Enable Weather Sync',
      trayWeatherSyncConfig: '🌤️ Set City',
      citySettingTitle: 'Set City',
      citySettingCurrent: 'Current City:',
      citySettingNone: 'Not Set',
      citySettingPlaceholder: 'Enter city name',
      citySettingConfirm: 'Confirm',
      citySettingSuccess: 'Set to {city}',
      citySettingError: 'City not found, please check the name',
      citySettingSearching: 'Searching…',
      trayMinuteUnit: 'min',
      pomodoroTitle: 'A.Z. Fell & Co. Bookshop Study',
      pomodoroPin: 'Pin on top',
      pomodoroUnpin: 'Unpin',
      pomodoroClose: 'Close',
      pomodoroPrompt: 'How long shall we focus, my dear?',
      pomodoroDecrease: 'Decrease',
      pomodoroIncrease: 'Increase',
      pomodoroStart: 'Begin Study',
      pomodoroStop: 'End Early',
      pomodoroCompleted: 'Focus Complete',
      pomodoroCompleteMessage: 'Time flies when engrossed in a good book. Care for a cup of tea?',
      pomodoroFinish: 'Done',

      // Update Dialogs
      updateErrTitle: 'Update Failed',
      updateBtnOk: 'OK',
      updateErrNetwork: 'Cannot connect to update source. Please try again later. If your network is fine, GitHub might be temporarily unavailable.',
      updateErrServer: 'Update server is temporarily unavailable. Please try again later.',
      updateErrDownload: 'Update download interrupted. Please try again. If it keeps failing, consider downloading the installer manually.',
      updateErrGeneric: 'Failed to check for updates. Details have been logged.',
      updateErrDetailPrefix: 'Reason: ',
      updateErrUnknownDetail: 'Reason: Unknown error, details have been logged.',

      updateAvailTitle: 'Update Available',
      updateAvailMsg: 'A new version {version} is available. Would you like to download it now?',
      updateAvailMsgNoVer: 'A new version is available. Would you like to download it now?',
      updateBtnDownload: 'Download',
      updateBtnLater: 'Later',

      updateNotAvailTitle: 'Up to Date',
      updateNotAvailMsg: 'You are currently on the latest version {version}.',
      updateNotAvailMsgNoVer: 'You are currently on the latest version.',

      updateReadyTitle: 'Update Downloaded',
      updateReadyMsg: 'Version {version} has been downloaded. Restart the app and install now?',
      updateReadyMsgNoVer: 'The update has been downloaded. Restart the app and install now?',
      updateBtnInstall: 'Install and Restart App',

      updateCheckingTitle: 'Checking for Updates',
      updateDownloadingTitle: 'Downloading Update',
      updateInProgressTitle: 'Update in Progress',
      updateCheckingMsg: 'Checking for updates, please wait...',
      updateDownloadingMsg: 'Downloading update, please wait...',

      updateDevTitle: 'Development Mode',
      updateDevMsg: 'Checking for updates is not supported in development mode. Please use a packaged build to test updates.',

      // macOS manual update (no Developer ID certificate)
      updateMacManualTitle: 'Check for Updates',
      updateMacManualMsg: 'Quit the current app from the tray menu first, then download the latest DMG and drag it into Applications to replace the old app.',
      updateMacManualBtn: 'Open Download Page',

      // Language options
      langZh: '中文',
      langEn: 'English',
      langJa: '日本語',

      // Dynamic bubbles (Context Menu actions)
      bubbleFeedYueqi: '(Munching away…)',
      bubbleFeedShenjiu: '(Savors gracefully) ...Positively exquisite.',
      bubbleMeditateYueqi: '(Glares with spray bottle) GROW BETTER! Hear me?!',
      bubbleMeditateShenjiu: '(Opens a rare first edition) ...Irreplaceable prose.',
      bubblePetYueqi: '(Scoffs, but secretly leans into the touch)',
      bubblePetShenjiu: 'Oh, you are too kind, my dear.',
      bubbleRestYueqi: '(Curled up on the sofa napping...)',
      bubbleRestShenjiu: '(Dozing peacefully in the armchair)',
      bubbleRestTooHungry: 'Too hungry to rest…',

      // Return welcome
      returnYueqi: (n) => `You were gone for ${n} hours. Angel was getting restless.`,
      returnShenjiu: '...Oh, thank heavens, you\'re back!',

      // Time phase chatter
      morningYueqi: 'Morning. Another splendid day for subtle temptations.',
      morningShenjiu: 'Good morning! A lovely day for tea and a first edition.',
      dayYueqi: 'Broad daylight. Nothing beats a blast in the Bentley.',
      dayShenjiu: 'Afternoon light is perfect. A pot of Earl Grey and a crepe, perhaps?',
      duskYueqi: 'Dusk already. Table for two at The Ritz?',
      duskShenjiu: 'Sunset at last. Time for an aged Châteauneuf-du-Pape.',
      eveningYueqi: 'Night falls over London. Humans are packing it in.',
      eveningShenjiu: 'Evening chill. I should tend to the bookshop hearth.',
      nightYueqi: 'Still awake? Don\'t tempt me to drag you to sleep.',
      nightShenjiu: 'It is very late, my dear. Do take some rest.',
    },
    dialogues: {
      greet: {
        yueqi: [
          'Angel! Fancy meeting you here.',
          'Fancy a spot of lunch at the Ritz, Aziraphale?',
          'I was getting bored out of my mind. Good to see your face.',
          'Still hunting for gastronomic miracles in Soho?',
          'Angel, London is far too quiet today. Care for a drive?',
        ],
        shenjiu: [
          'Oh, Crowley! Do give a chap a moment to breathe.',
          'Crowley! How lovely. I just put the kettle on.',
          'Hello, my dear! It really is a splendid afternoon.',
          'Must you wear those dark glasses indoors?',
          'I am rather glad you came, Crowley.',
        ],
      },
      shareFood: {
        yueqi: [
          'Brought you a warm croissant straight from Paris. Eat up, Angel.',
          'Saved the last crepe from the Ritz for you. Take it.',
          'Here. Something sweet to keep your spirits up.',
        ],
        shenjiu: [
          'Oh, wonderful! You spoil me rotten, Crowley!',
          'You really shouldn\'t have... but I shall happily accept!',
          'Mmm, heavenly! You have exquisite taste, my dear.',
        ],
      },
      cultivate: {
        yueqi: [
          'How about a twenty-five-Lazarus miracle together?',
          'Ready to perform a miracle, Angel? Just you and me.',
          'Let\'s show Upstairs and Downstairs what we can do.',
        ],
        shenjiu: [
          'Together, then. But let\'s keep it discreet, Crowley.',
          'Careful, Crowley! We don\'t want Heaven noticing.',
          'A joint miracle? Why, together we can accomplish anything.',
        ],
      },
      kiss: {
        yueqi: [
          '...You complete and utter idiot, Angel.',
          'Shut up and kiss me.',
          'Six thousand years... and it\'s always been you.',
        ],
        shenjiu: [
          '...I forgive you, Crowley.',
          '(Gasps softly, ears turning pink)',
          'Oh, Crowley...',
        ],
      },
      hug: {
        yueqi: [
          'Come here, Angel.',
          'I\'m not letting anyone take you away again.',
          'Just let me hold you for a moment.',
        ],
        shenjiu: [
          'Crowley... (Leans gently into the embrace)',
          '(Wraps arms around his back, holding tightly)',
          'It is alright, my dear. I am right here.',
        ],
      },
      throwup: {
        // Fires when shareFood would overfill ShenJiu
        yueqi: [
          'Angel! Are you about to explode from too many crepes?!',
          'I told you not to eat fifty pastries in one sitting!',
          'Hold on! Let me miracle up some indigestion remedy!',
        ],
        shenjiu: [
          'Urgh... perhaps that second dozen scones was ill-advised...',
          'I am incapacitated! Crowley, please do not look at me!',
          'I cannot take another single bite... oh dear lord...',
        ],
      },
      idle: {
        yueqi: [
          'My houseplants in Soho must be shivering in terror right now.',
          'The Bentley\'s stereo is playing Best of Queen again.',
          'Where has that ridiculous angel wandered off to?',
          '(Adjusts dark sunglasses coolly)',
          'Six thousand years on this ball of dirt. One grows attached.',
        ],
        shenjiu: [
          'Now, wherever did I misplace that 1802 Shakespeare folio?',
          'Tea time already? Or perhaps a little vintage claret...',
          'I really ought to tidy the shop shelves... tomorrow.',
          '(Turns a delicate yellowed page, savoring the scent of old paper)',
          'I wonder if Crowley is stopping by today...',
        ],
      },
      weather_rain: {
        yueqi: ['Rain. Good thing I have a massive black umbrella.', 'London drizzle. Utterly predictable.'],
        shenjiu: ['Cozy afternoon for reading by the hearth.', '(Snuggles under Crowley\'s umbrella)'],
      },
      weather_snow: {
        yueqi: ['Freezing out. Angels don\'t catch colds, do they?', 'Snow in London. Traffic will be positively apocalyptic.'],
        shenjiu: ['Snow! It looks like powdered sugar on a plum pudding.', '(Snugly adjusts tartan scarf)'],
      },
      weather_clear: {
        yueqi: ['Bright sunshine. Sunglasses staying firmly on.', 'Fine afternoon for 90mph through St. James\'s Park.'],
        shenjiu: ['A glorious day! Perfect for a stroll to feed the ducks.', 'The sunlight through the bookshop glass is delightful.'],
      },
      weather_cloudy: {
        yueqi: ['Grey skies. Rather matches my usual disposition.', 'Just dull clouds. Nothing to miracle about.'],
        shenjiu: ['Gentle overcast. Perfect lighting for reading manuscript ink.', '(Glances warmly out the shop window)'],
      },
      weather_overcast: {
        yueqi: ['Gloomy. Reminds me of a dreary board meeting Down Below.', 'Sky looks menacing. Even for my taste.'],
        shenjiu: ['Looks like a heavy downpour is brewing.', '(Checks the bookshop roof for potential drips)'],
      },
      weather_windy: {
        yueqi: ['Gale force wind. Nearly ripped my sunglasses off.', 'Who turned the celestial air conditioning up to eleven?'],
        shenjiu: ['My goodness, hold onto your hat, Crowley!', '(Hastily holds down fluttering manuscript pages)'],
      },
      weather_thunderstorm: {
        yueqi: ['Thunder! Upstairs having another celestial tantrum?', 'Don\'t fret, Angel, lightning avoids the Bentley.'],
        shenjiu: ['Gracious, what a tremendous crash of thunder!', '(Flinches slightly at the sudden flash)'],
      },
      weather_heat: {
        yueqi: ["Scorching heatwave. Reminds me of the Pit. Hate it.", "Melted asphalt everywhere. Bentley's tyres are grumbling.", "Too bloody hot. Let's find some air conditioning."],
        shenjiu: ["My word, it is sweltering! Ice cream from Fortnum's sounds imperative.", "(Gently fans himself with a vintage pamphlet)", "Far too hot outside... do stay inside where it's cool."],
      },
      hungry: {
        yueqi: ['Getting a bit peckish...', 'Time for a proper lunch at the Ritz?'],
        shenjiu: ['My stomach is making rather un-angelic noises...', 'I believe it is high time for afternoon tea.'],
      },
      lowQi: {
        yueqi: ['Demonic energy running dangerously low...', 'Need a recharge. Miracles don\'t perform themselves.'],
        shenjiu: ['My angelic grace feels rather depleted...', 'A quiet moment of rest is needed to restore my strength.'],
      },
      lowMood: {
        yueqi: ['Bored and thoroughly irritated. Might go cause minor havoc.', 'Leave me alone for five minutes.'],
        shenjiu: ['...A little weary of eternity today.', '(Sighs softly over an unfinished page)'],
      },
      effects: {
        greet: '💬',
        shareFood: '🥐',
        cultivate: '✨',
        kiss: '💋',
        hug: '💕',
      },
      breakReminder: {
        yueqi: [
          'Get on your feet, human! Even demons don\'t slouch for two hours straight.',
          'Up! Move around before your spine fuses to that chair.',
          'Take a stroll! Or must I send a tiny harmless snake to nudge your ankles?',
          'Sitting like a gargoyle will ruin you. Stand up and stretch!',
          'On your feet! Your wellbeing happens to be on my watch today.',
        ],
        shenjiu: [
          'My dear, you have been sitting quite long enough. Do stand up and stretch.',
          'A brisk little stroll would do wonders for your constitution!',
          'Even in deep scholarly research, one must mind one\'s posture.',
          'Why not pause, stretch your limbs, and brew a nice warm cup of tea?',
          'Prolonged sitting is terrible for the body. Up you get, just for a moment.',
        ],
      },
      screensaverCaught: {
        yueqi: ['Nothing to see here! Mind your own business!', 'Ahem... we were merely discussing theology.', 'Caught us? What on earth are you implying?!'],
        shenjiu: ['Good heavens! (Blushes in flustered embarrassment)', 'We were just... admiring the bookbindings!', 'Please don\'t startle us like that, dear!'],
      },
      dream: {
        lowAffection: {
          yueqi: [
            '(Slumbering softly like a coiled serpent)',
            'Mmm...',
            '(Tosses and turns)',
          ],
          shenjiu: [
            '...Crowley, too noisy.',
            '(Frowns slightly in his sleep)',
            '...Quiet down, you.',
          ],
        },
        highAffection: {
          yueqi: [
            'Don\'t leave me behind, Angel...',
            'Alpha Centauri... just the two of us...',
            '(Smiling gently in his sleep)',
          ],
          shenjiu: [
            '...Crowley, dear boy...',
            '(Clutching Crowley\'s sleeve in sleep)',
            '(Subconsciously leaning closer for warmth)',
          ],
        },
        linked: {
          shenjiu: [
            'Crowley? Where are you...',
            '...Don\'t leave me, Crowley.',
          ],
          yueqi_reply: [
            'I\'m right here, Angel. Not going anywhere.',
            'Right beside you. Always.',
          ]
        }
      },
    },
  },

  /* ================================================================
   * 日本語（古風・雅致）
   * ================================================================ */
  ja: {
    ui: {
      // 右クリックメニュー (右键菜单)
      feed: '🥐 美味しい食事',
      meditate: '✨ 奇跡を行う',
      meditateYueqi: '🪴 観葉植物の世話',
      meditateShenjiu: '📖 古書を読む',
      petYueqi: '🤚 天使の微笑み',
      petShenjiu: '🤚 悪魔の気遣い',
      rest: '💤 休息',
      status: '📊 状態確認',

      // 状態パネル
      statusTitle: 'ステータス',
      statAffection: '親愛度',
      statHunger: '満腹度',
      statQi: '奇跡の力',
      statMood: '気分',

      // ペット名
      nameYueqi: 'クロウリー',
      nicknameYueqi: 'クロウリー',
      nameShenjiu: 'アジラフェル',
      nicknameShenjiu: 'アジラフェル',

      // 装束名
      skinDefault: '既定装束・(絵師) Nano Banana',  // “装束”比“スキン（Skin）”更有古风雅致的感觉，括号内保留英文艺术家署名以示尊重
      skinBirds: '小鳥七九・(絵師) Hamster Salad',
      skinAnimalEars: '猫兎七九・(絵師) Violetfirefly',
      skinSchoolAu: '学園七九・(絵師) M_Shang',

      // 装束選択（分割）
      skinDefaultLabel: '既定装束',
      skinBirdsLabel: '小鳥七九',
      skinAnimalEarsLabel: '猫兎七九',
      skinSchoolAuLabel: '学園七九',
      skinDefaultArtist: 'Nano Banana',
      skinBirdsArtist: 'Hamster Salad',
      skinAnimalEarsArtist: 'Violetfirefly',
      skinSchoolAuArtist: 'M_Shang',

      // トレイメニュー
      trayTitle: 'CA デスクトップペット',
      trayShowStatusPanel: '📊 状態表示',
      trayHideStatusPanel: '📊 状態非表示',
      traySwitchSkin: '🎨 装束変更',      // “装束（しょうぞく）”完美平替现代外来语“スキン（Skin）皮肤”
      trayChooseSkin: '🎨 装束を選ぶ…',
      trayPetScale: '📏 大きさ調整…',
      petScaleTitle: '大きさ調整',
      petScaleCurrent: '現在の大きさ：',
      petScaleReset: '既定に戻す',
      petScaleConfirm: '決定',
      petScaleCancel: '戻る',
      skinSelectorTitle: '装束を選ぶ',
      skinSelectorCurrent: '使用中',
      skinSelectorEmpty: '利用できる装束はありません。',
      skinSelectorError: '装束の変更に失敗しました。もう一度お試しください。',
      skinSelectorConfirm: '決定',
      skinSelectorCancel: '戻る',
      trayPauseWalk: '⏸️ 歩行停止',
      trayResumeWalk: '🚶🏻‍♂️ 歩行再開',
      trayHidePet: '👻 姿を隠す',      // “隐去身形”，比“隐藏宠物”更有仙术感
      trayShowPet: '👻 姿を現す',      // “显露身形”
      trayResetPos: '🔄 位置復元',      // 归位/复原
      traySwitchScreen: '🖥️ 画面切り替え',
      trayScreen: '画面',
      trayAutoLaunchOn: '🚀 起動時常駐を無効化',
      trayAutoLaunchOff: '🚀 起動時常駐',    // “常驻”比“登录时启动”更简练
      trayWindowAwarenessOn: '🪟 境界に乗る（有効化）',
      trayWindowAwarenessOff: '🪟 境界に乗る（無効化）',
      trayWindowAwarenessUnavailable: '🪟 境界に乗る（未対応）',
      trayPomodoroOpen: '📖 古書店での読書',
      trayPomodoroRunning: '📖 読書中',
      trayPomodoroCompleted: '📖 読書完了',
      trayDevTools: '🛠️ 開発者ツール',
      trayQuit: '❌ 終了',          // “退室”比冷冰冰的“終了（结束）”更具角色互动的沉浸感
      trayLanguage: '🌐 言語設定',
      trayUpdateCheck: '📦 更新を確認',
      trayUpdateChecking: '📦 更新を確認中...',
      trayUpdateDownloading: '📦 更新をダウンロード中...',
      trayVersion: '🏷️ 現行版',

      // 休憩リマインダー
      trayBreakReminderOn: '⏰ 休憩通知を無効化',
      trayBreakReminderOff: '⏰ 休憩通知を有効化',
      trayBreakReminderInterval: '⏰ 通知間隔',
      trayScreensaverOn: '💕 甘々待機画面を無効化',
      trayScreensaverOff: '💕 甘々待機画面を有効化',
      trayScreensaverThreshold: '💕 待機時間',
      trayWeatherSyncOn: '🌤️ 天気同期を無効化',
      trayWeatherSyncOff: '🌤️ 天気同期を有効化',
      trayWeatherSyncConfig: '🌤️ 都市設定',
      citySettingTitle: '都市設定',
      citySettingCurrent: '現在の都市：',
      citySettingNone: '未設定',
      citySettingPlaceholder: '都市名を入力',
      citySettingConfirm: '確認',
      citySettingSuccess: '{city}に設定しました',
      citySettingError: '都市が見つかりません。名前を確認してください',
      citySettingSearching: '検索中…',
      trayMinuteUnit: '分',
      pomodoroTitle: 'A.Z.フェル古書店 読書タイム',
      pomodoroPin: '最前面に固定',
      pomodoroUnpin: '固定を解除',
      pomodoroClose: '閉じる',
      pomodoroPrompt: 'どのくらい集中するかい、親愛なる友よ？',
      pomodoroDecrease: '減らす',
      pomodoroIncrease: '増やす',
      pomodoroStart: '集中を始める',
      pomodoroStop: '途中で終える',
      pomodoroCompleted: '集中完了',
      pomodoroCompleteMessage: '読書に夢中になっていると時間はあっという間だね。紅茶でもいかが？',
      pomodoroFinish: '完了',

      // 更新ダイアログ
      updateErrTitle: '更新失敗',
      updateBtnOk: '了解',
      updateErrNetwork: '更新元に接続できません。後でもう一度お試しください。通信状況が良好な場合は、GitHubが一時的にダウンしている可能性があります。',
      updateErrServer: '更新サーバーが一時的に利用できません。後でもう一度お試しください。',
      updateErrDownload: 'ダウンロードが中断されました。後で再試行するか、手動でインストーラーをダウンロードしてください。',
      updateErrGeneric: '更新の確認に失敗しました。詳細はログに記録されています。',
      updateErrDetailPrefix: '原因：',
      updateErrUnknownDetail: '原因：不明なエラー。詳細はログに記録されています。',

      updateAvailTitle: '新しいバージョン',
      updateAvailMsg: '新しいバージョン {version} が見つかりました。今すぐダウンロードしますか？',
      updateAvailMsgNoVer: '新しいバージョンが見つかりました。今すぐダウンロードしますか？',
      updateBtnDownload: 'ダウンロード',
      updateBtnLater: '後で',

      updateNotAvailTitle: '最新バージョンです',
      updateNotAvailMsg: '現在のバージョン {version} は最新です。',
      updateNotAvailMsgNoVer: 'すでに最新バージョンです。',

      updateReadyTitle: 'ダウンロード完了',
      updateReadyMsg: 'バージョン {version} のダウンロードが完了しました。今すぐアプリを再起動してインストールしますか？',
      updateReadyMsgNoVer: '更新のダウンロードが完了しました。今すぐアプリを再起動してインストールしますか？',
      updateBtnInstall: 'アプリを再起動してインストール',

      updateCheckingTitle: '更新を確認中',
      updateDownloadingTitle: '更新をダウンロード中',
      updateInProgressTitle: '更新確認中',
      updateCheckingMsg: '更新を確認しています。しばらくお待ちください。',
      updateDownloadingMsg: '更新をダウンロードしています。しばらくお待ちください。',

      updateDevTitle: '開発モード',
      updateDevMsg: '開発モードでは更新機能を利用できません。自動更新のテストはパッケージ版をご利用ください。',

      // macOS 証明書なし手動更新
      updateMacManualTitle: '更新を確認',
      updateMacManualMsg: 'まずトレイメニューから現在のアプリを完全に終了し、最新のDMGをダウンロードしてApplicationsにドラッグし、古いアプリを置き換えてください。',
      updateMacManualBtn: 'ダウンロードページを開く',

      // Language options
      langZh: '中文',
      langEn: 'English',
      langJa: '日本語',

      // 動的気泡（右クリックアクション）
      bubbleFeedYueqi: '（無造作に頬張る…）',
      bubbleFeedShenjiu: '（優雅に味わう）…実に見事な味だ。',
      bubbleMeditateYueqi: '（霧吹きを構えて威嚇する）もっと立派に育て！いいか！',
      bubbleMeditateShenjiu: '（貴重な初版本を開く）…かけがえのない一節だ。',
      bubblePetYueqi: '（フンと鼻を鳴らしつつ、密かに寄り添う）',
      bubblePetShenjiu: 'おや、君は本当に優しいね、親愛なる友よ。',
      bubbleRestYueqi: '（ソファで丸くなって眠る…）',
      bubbleRestShenjiu: '（肘掛け椅子で安らかにまどろむ）',
      bubbleRestTooHungry: '空腹で休むに休めぬ…',

      // 帰還の挨拶
      returnYueqi: (n) => `${n}時間も留守にするとはな。天使が待ちくたびれていたぞ。`,
      returnShenjiu: '…ああ、神よ感謝します、戻ってきてくれたんだね！',

      // 時段の雑談
      morningYueqi: 'おい、朝だぞ。今日も些細な悪事日和だな。',
      morningShenjiu: 'おはよう！紅茶と古書を楽しむのに最高の朝だね。',
      dayYueqi: '真っ昼間だな。ベントレーで飛ばすには悪くない。',
      dayShenjiu: '午後の光が心地よいね。クレープとダージリンはいかが？',
      duskYueqi: 'もう夕暮れか。リッツの予約はどうなってる？',
      duskShenjiu: '日が暮れてきたね。上等なシャトーヌフ＝デュ＝パプを開けよう。',
      eveningYueqi: 'ロンドンに夜が来たな。人間どもは引き上げる時間だ。',
      eveningShenjiu: '夜風が冷えてきた。書店の暖炉に火を入れないとね。',
      nightYueqi: 'まだ起きてるのか？寝かしつけてやろうか。',
      nightShenjiu: 'もうこんな時間だ、親愛なる友よ。ゆっくりお休み。',
    },
    dialogues: {
      greet: {
        yueqi: [
          'おい、天使。こんなところで会うとはな。',
          'リッツで一杯どうだ、アジラフェル？',
          '退屈してたところだ。お前の顔が見られて助かったぜ。',
          '相変わらず美味そうなものばかり探してるのか？',
          'よお、天使。今日のロンドンは平和すぎるな。',
        ],
        shenjiu: [
          'おや、クロウリー。驚かせないでくれ。',
          'クロウリー！ちょうどお茶を淹れたところだよ。',
          'やあ、親愛なる友よ。今日もいい日だね。',
          'またそんな怪しげなサングラスをかけて…',
          'ふふ、君が来てくれて嬉しいよ、クロウリー。',
        ],
      },
      shareFood: {
        yueqi: [
          'パリの焼き立てクロワッサンだ。食えよ、天使。',
          'リッツの特製クレープだ。お前の分を取っておいた。',
          'ほら、甘いものだ。遠慮するな。',
        ],
        shenjiu: [
          'まあ！素晴らしいよ、クロウリー！いただきます！',
          '君は本当に私を甘やかすのが上手いねえ…',
          'んん〜っ！至福の味だ…！',
        ],
      },
      cultivate: {
        yueqi: [
          '25ラザロ級の合同奇跡といこうぜ。',
          'おい天使、一緒に奇跡を起こす準備はいいか？',
          '俺たちの力、見せつけてやろうじゃないか。',
        ],
        shenjiu: [
          '力を合わせよう、クロウリー。でも、目立ちすぎないようにね。',
          '天国に気付かれないよう、小さな奇跡にするんだよ。',
          'ふふ、二人一緒なら百人力だね。',
        ],
      },
      kiss: {
        yueqi: [
          '…この大馬鹿天使め。',
          '黙って、俺にキスしろ。',
          '6000年…いつだってお前だけだった。',
        ],
        shenjiu: [
          '…許してあげるよ、クロウリー。',
          '（息を呑み、耳元まで赤く染まる）',
          '…クロウリー。',
        ],
      },
      hug: {
        yueqi: [
          'こっちへ来い、天使。',
          '二度とお前を誰にも奪わせない。',
          '…少しだけ、こうしていさせろ。',
        ],
        shenjiu: [
          'クロウリー…（そっと身を預ける）',
          '（背中に腕を回し、ぎゅっと抱きしめ返す）',
          '大丈夫、私はここにいるよ。',
        ],
      },
      throwup: {
        // 分食時に過食で発生
        yueqi: [
          'おい天使！クレープの食いすぎで破裂する気か？！',
          'だから五十個も食べるなと言ったんだ！',
          'ったく…胃薬の奇跡でも起こしてやるよ！',
        ],
        shenjiu: [
          'うぷっ…流石にスコーンを食べすぎたようだ…',
          'もう一歩も動けない…見ないでくれたまえ…',
          '美味しかったけれど…少し後悔しているよ…',
        ],
      },
      idle: {
        yueqi: [
          'ソーホーの部屋の観葉植物ども、今頃震え上がってるだろうな。',
          'ベントレーのカセットデッキからまたクイーンが流れてる。',
          'あの呑気な天使はどこへ散歩に行ったんだ？',
          '（サングラスの位置を直す）',
          '6000年も地球にいりゃ、愛着も湧くってもんだ。',
        ],
        shenjiu: [
          'おや、1802年版のシェイクスピア戯曲集はどこに置いたっけな…',
          'そろそろ紅茶の時間かな。それとも少し良い赤ワインを…',
          '本棚を整理しなければ…いや、明日にしよう。',
          '（古い書物の頁をめくり、香りを吸い込む）',
          'クロウリーはまだ来ないのかな…',
        ],
      },
      weather_rain: {
        yueqi: ['雨か。特大の黒傘を持ってきたから問題ない。', 'ロンドン名物の霧雨だな。'],
        shenjiu: ['雨宿りしながら暖炉の前で読書…最高の日だね。', '（クロウリーの傘の下にそっと潜り込む）'],
      },
      weather_snow: {
        yueqi: ['冷えるな。おい天使、まさか風邪なんか引かないだろうな？', 'ロンドンに雪か。ベントレーを飛ばすには滑りすぎる。'],
        shenjiu: ['雪だ！まるで粉砂糖をまぶしたお菓子のようだね。', '（タータンチェックのマフラーを巻き直す）'],
      },
      weather_clear: {
        yueqi: ['快晴だな。サングラスが手放せないぜ。', 'セント・ジェームズ・パークまでひとっ走りするか。'],
        shenjiu: ['心地よい日差しだ。鴨にパンをあげに行こうか。', '古書店に差し込む木漏れ日がとても美しいよ。'],
      },
      weather_cloudy: {
        yueqi: ['曇り空。ロンドンらしくて悪くない。', '退屈な雲だな。一雨降らせてやろうか。'],
        shenjiu: ['柔らかな曇り空だね。本を読むには眩しすぎずちょうどいい。', '（窓の外の雲をのんびり眺める）'],
      },
      weather_overcast: {
        yueqi: ['どんよりした空だ。地獄の会議を思い出すぜ。', '空が重いな。嵐でも来なきゃいいが。'],
        shenjiu: ['今にも降り出しそうだ。書店の窓は閉めたかな…', '（心配そうに屋根の軋みを見上げる）'],
      },
      weather_windy: {
        yueqi: ['風が強いな。サングラスが吹き飛ばされそうだ。', '誰だ、換気扇を全開にした奴は。'],
        shenjiu: ['おやまあ、すごい風！帽子を押さえないと！', '（飛ばされそうな原稿用紙を慌てて押さえる）'],
      },
      weather_thunderstorm: {
        yueqi: ['雷か。上の奴らが癇癪でも起こしたか？', '雷鳴なんて気にするな、天使。ベントレーには落ちないさ。'],
        shenjiu: ['おやまあ！激しい雷だね…！', '（稲光に少し身を縮める）'],
      },
      weather_heat: {
        yueqi: ['猛暑だ。地獄の釜茹でを思い出して胸糞悪いぜ。', 'アスファルトが溶けそうだ。ベントレーが悲鳴を上げてる。', 'クソ暑いな。どこか涼しいところへ行こう。'],
        shenjiu: ['なんという暑さだ！フォートナム＆メイソンのアイスが必要だね。', '（未読のパンフレットでパタパタ扇ぐ）', '外は危険な暑さだ。涼しい室内にいなさい。'],
      },
      hungry: {
        yueqi: ['少し腹が減ったな。何か美味いものでも探しに行くか。', 'リッツでランチにするか？'],
        shenjiu: ['お腹が天使らしからぬ音を立ててしまったよ…', 'そろそろスコーンと紅茶をいただかないとね。'],
      },
      lowQi: {
        yueqi: ['悪魔のエネルギーが切れかけてる…', '少しチャージが必要だな。奇跡もタダじゃない。'],
        shenjiu: ['恩寵が少し薄れてきたようだ…', '静かに瞑想して力を取り戻さなければ。'],
      },
      lowMood: {
        yueqi: ['退屈でイライラする。何か悪戯でも仕掛けてやるか。', '5分だけでいい、放っておいてくれ。'],
        shenjiu: ['……少し、永遠というものに疲れてしまったかな。', '（未読の頁を前に、小さくため息をつく）'],
      },
      effects: {
        greet: '💬',
        shareFood: '🥐',
        cultivate: '✨',
        kiss: '💋',
        hug: '💕',
      },
      breakReminder: {
        yueqi: [
          'おい人間、立ち上がれ！悪魔だってそんなに長時間座りっぱなしにはならんぞ。',
          '背骨が椅子と合体する前に体を動かせ！',
          '少し歩き回れ。それとも足元に蛇でも這わせてやろうか？',
          '根を詰めるなよ。ベントレーでドライブにでも連れて行かれたいか？',
          '立ち上がって伸びをしろ。お前の健康も俺の管轄だからな。',
        ],
        shenjiu: [
          'おやまあ、ずいぶん長く座っているね。少し立って歩いてごらん？',
          '少し散歩をして外の空気を吸うと、頭がすっきりするよ。',
          '熱心なのは素晴らしいけれど、お体も大切にね。',
          '立ち上がって軽くストレッチをしてみてはどうだい？',
          '美味しいお茶を淹れて、少し休憩にしよう。',
        ],
      },
      screensaverCaught: {
        yueqi: ['な、何でもない！余計なお世話だ！', 'ゴホン…神学的な議論をしてただけだ！', '見ただと？！変な勘繰りをするなよ！'],
        shenjiu: ['おやまあ！（顔を真っ赤にして慌てる）', '私たちはただ…本の装丁を眺めていただけだよ！', '驚かせないでおくれよ、もう…！'],
      },
      dream: {
        lowAffection: {
          yueqi: [
            '（蛇のように静かに寝息を立てる）',
            'ん…',
            '（寝返りを打つ）',
          ],
          shenjiu: [
            '…クロウリー、うるさいよ。',
            '（小さく眉をひそめて寝言）',
            '…あっちへ行ってくれ。',
          ],
        },
        highAffection: {
          yueqi: [
            '置いていくなよ、天使…',
            'アルファ・ケンタウリ…二人きりで…',
            '（寝ながら口元を綻ばせる）',
          ],
          shenjiu: [
            '…クロウリー…',
            '（眠りながらクロウリーの袖をぎゅっと握る）',
            '（無意識に温もりへ寄り添う）',
          ],
        },
        linked: {
          shenjiu: [
            'クロウリー？どこにいるの…',
            '…行かないで、クロウリー。',
          ],
          yueqi_reply: [
            'ここにいるよ、天使。どこへも行かないさ。',
            'お前のすぐ隣にいる。ずっと一緒だ。',
          ]
        }
      },
    },
  },
};

const DICTIONARY = Object.fromEntries(
  Object.entries(I18N).map(([locale, dictionary]) => {
    const ui = dictionary.ui;
    return [
      locale,
      {
        ...ui,
        trayShow: ui.trayShowPet,
        trayHide: ui.trayHidePet,
        trayExit: ui.trayQuit,
        trayDesc: ui.trayTitle,
        updateTitle: ui.updateAvailTitle,
        updateMessage: ui.updateAvailMsgNoVer,
        updateCancel: ui.updateBtnLater,
        updateInstall: ui.updateBtnInstall,
        contextMenuFeed: ui.feed,
        contextMenuCultivate: ui.meditate,
        contextMenuRest: ui.rest,
        contextMenuStatus: ui.status,
      },
    ];
  }),
);

if (typeof module !== 'undefined') {
  module.exports = { I18N, DICTIONARY };
}
