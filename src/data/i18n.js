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
      feed: '🍎 喂食',
      meditate: '🧘🏻‍♂️ 打坐修炼',
      petYueqi: '🤚 小九撒娇',
      petShenjiu: '🤚 七哥关怀',
      rest: '💤 休息',
      status: '📊 查看状态',

      // 状态面板
      statusTitle: '修仙状态',
      statAffection: '好感',
      statHunger: '饱腹',
      statQi: '灵力',
      statMood: '心境',
      statusFooter: 'Make QiJiu Great Again!',

      // 宠物名
      nameYueqi: '岳清源',
      nicknameYueqi: '岳七',
      nameShenjiu: '沈清秋',
      nicknameShenjiu: '沈九',

      // 皮肤名
      skinDefault: '默认皮肤·凉拌仓鼠',
      skinBirds: '鸟塑七九·凉拌仓鼠',
      skinAnimalEars: '猫兔七九·紫萤',

      // 托盘菜单
      trayTitle: '岳清源x沈清秋 桌面爱宠',
      trayShowStatusPanel: '📊 显示状态面板',
      trayHideStatusPanel: '📊 隐藏状态面板',
      traySwitchSkin: '🎨 切换皮肤',
      trayPauseWalk: '⏸️ 暂停走动',
      trayResumeWalk: '🚶 恢复走动',
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
      trayPomodoroOpen: '🧘🏻‍♂️ 苍穹静修',
      trayPomodoroRunning: '🧘🏻‍♂️ 闭关中',
      trayPomodoroCompleted: '🧘🏻‍♂️ 静修圆满',
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
      pomodoroTitle: '苍穹静修',
      pomodoroPin: '置顶',
      pomodoroUnpin: '取消置顶',
      pomodoroClose: '关闭',
      pomodoroPrompt: '本次闭关多久？',
      pomodoroDecrease: '减少',
      pomodoroIncrease: '增加',
      pomodoroStart: '开始静修',
      pomodoroStop: '提前出关',
      pomodoroCompleted: '静修圆满',
      pomodoroCompleteMessage: '闭关结束，修为又大有精进。',
      pomodoroFinish: '出关',

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
      bubbleFeedYueqi: '（享用中…）',
      bubbleFeedShenjiu: '…还行吧。',
      bubbleMeditateYueqi: '入定…',
      bubbleMeditateShenjiu: '（闭目凝神）',
      bubblePetYueqi: '（宠溺地笑）',
      bubblePetShenjiu: '…谁要你管。',
      bubbleRestYueqi: '稍作休整。',
      bubbleRestShenjiu: '（假寐）',
      bubbleRestTooHungry: '太饿了，无法休息…',

      // 回归欢迎
      returnYueqi: (n) => `你走了${n}个时辰…`,
      returnShenjiu: '…哼，终于回来了。',

      // 时段闲聊
      morningYueqi: '早安。',
      morningShenjiu: '哼，起得倒早。',
      dayYueqi: '白日漫长，莫要太过劳累。',
      dayShenjiu: '…大白天的，别到处乱晃。',
      duskYueqi: '黄昏了，一日又要结束了。',
      duskShenjiu: '天色暗了。',
      eveningYueqi: '夜幕已降，早点歇息吧。',
      eveningShenjiu: '…少烦我，滚去睡觉。',
      nightYueqi: '夜深了，早些休息吧。',
      nightShenjiu: '…还不睡？想猝死吗。',
    },
    dialogues: {
      greet: {
        yueqi: [
          '小九，你也在这里。',
          '清秋师弟，今日可好？',
          '清秋师弟，许久不见。',
          '小九，要一起走走吗？',
          '清秋师弟，你的气色好了许多。',
        ],
        shenjiu: [
          '岳七。',
          '…嗯。',
          '掌门师兄，别来无恙。',
          '你怎么又来了。',
          '哼，闲人一个。',
        ],
      },
      shareFood: {
        yueqi: [
          '小九，这个给你吃。',
          '我不饿，你多吃一些。',
          '清秋，尝尝这个。',
        ],
        shenjiu: [
          '…谁要你的东西。',
          '（默默接过）',
          '哼…还算能入口。',
        ],
      },
      cultivate: {
        yueqi: [
          '小九，一起修炼吧。',
          '双修能事半功倍❤',
          '我来为你护法。',
        ],
        shenjiu: [
          '少废话，打坐。',
          '…别分心。',
          '（闭目凝神）',
        ],
      },
      kiss: {
        yueqi: [
          '小九…',
          '清秋，我很想你。',
          '让我靠近一点。',
        ],
        shenjiu: [
          '…岳七，你…！',
          '（耳尖微红）',
          '…哼。',
        ],
      },
      hug: {
        yueqi: [
          '小九，让我抱一下。',
          '你太瘦了。',
          '不会再放手了。',
        ],
        shenjiu: [
          '……',
          '（没有推开）',
          '（就像小时候那样）',
        ],
      },
      throwup: {
        // 分食时沈九饱腹已满，咽不下去触发
        yueqi: [
          '小九你怎么了？',
          '小九！！',
        ],
        shenjiu: [
          '呕~~你要撑死我吗？！',
          '够了！就你自己吃！',
          '再也吃不下了！！',
        ],
      },
      idle: {
        yueqi: [
          '小九在哪里呢…',
          '该去批阅公文了。',
          '该去修炼了。',
          '（整理衣冠）',
          '苍穹山的风景真好。',
        ],
        shenjiu: [
          '（翻书）',
          '…烦。',
          '如何突破瓶颈？',
          '（冷冷地看着远方）',
          '那个人…又没来。',
        ],
      },
      weather_rain: {
        yueqi: ['下雨了，小九当心着凉。', '这雨不知何时能停。'],
        shenjiu: ['…烦人的雨。', '（在屋檐下避雨）'],
      },
      weather_snow: {
        yueqi: ['下雪了，记得添衣。', '雪景虽好，却也寒冷。'],
        shenjiu: ['…有点冷。', '（微微缩手）'],
      },
      weather_clear: {
        yueqi: ['今日阳光真好，最适合修炼。', '天朗气清。'],
        shenjiu: ['阳光刺眼…', '这天倒是不错。'],
      },
      weather_cloudy: {
        yueqi: ['天色阴沉，似乎要变天了。', '起风了。'],
        shenjiu: ['阴天…让人提不起劲。', '（天气阴沉沉的）'],
      },
      weather_windy: {
        yueqi: ['风有些大，小九别站在风口。', '山风急了，衣袂都乱了。'],
        shenjiu: ['…风吵得人心烦。', '（拢了拢衣袖）'],
      },
      weather_thunderstorm: {
        yueqi: ['雷声近了，小九别怕。', '这场雷雨来得急，先避一避。'],
        shenjiu: ['…打雷而已，有什么好怕。', '（被雷光照得皱了皱眉）'],
      },
      hungry: {
        yueqi: ['有些饿了…', '该用膳了。'],
        shenjiu: ['…肚子叫了。', '辟谷也该有个限度。'],
      },
      lowQi: {
        yueqi: ['灵力快见底了。', '需要打坐恢复。'],
        shenjiu: ['灵力不足…', '该修炼了。'],
      },
      lowMood: {
        yueqi: ['心境不稳…', '有些心烦。'],
        shenjiu: ['…别烦我。', '（面无表情）'],
      },
      effects: {
        greet: '💬',
        shareFood: '🍎',
        cultivate: '✨',
        kiss: '💋',
        hug: '💕',
      },
      breakReminder: {
        yueqi: [
          '起来走走吧，你已经坐很久了。',
          '修行也要注意体魄。',
          '来，休息一下，起身走走。',
          '坚持修炼是好事，但也要活动筋骨。',
          '站起来伸展一下吧。',
        ],
        shenjiu: [
          '…别死坐着了，起来活动活动。',
          '（站起来）你也起来。',
          '身体是修炼的根基，别赖着不动。',
          '…哼，我只是顺便提醒你一下。',
          '久坐伤身，不想修练也得走两步。',
        ],
      },
    },
  },

  /* ================================================================
   * English
   * ================================================================ */
  en: {
    ui: {
      // Context menu
      feed: '🍎 Feed',
      meditate: '🧘🏻‍♂️ Cultivate', // 修正了拼写
      petYueqi: '🤚 XiaoJiu Clings',
      petShenjiu: '🤚 QiGe Spoils',
      rest: '💤 Rest',
      status: '📊 Status',

      // Status panel
      statusTitle: 'Cultivation Status',
      statAffection: 'Affection',
      statHunger: 'Satiety',
      statQi: 'Qi',
      statMood: 'Mood',
      statusFooter: 'Make QiJiu Great Again!',

      // Pet names
      nameYueqi: 'Yue Qingyuan',
      nicknameYueqi: 'Yue Qi',
      nameShenjiu: 'Shen Qingqiu',
      nicknameShenjiu: 'Shen Jiu',

      // Skin names
      skinDefault: 'Default Skin - (Artist) Hamster Salad',
      skinBirds: 'Cute Birds - (Artist) Hamster Salad',
      skinAnimalEars: 'Cat & Bunny - (Artist) Violetfirefly',

      // Tray menu
      trayTitle: 'YueQi & ShenJiu Desktop Pet',
      trayShowStatusPanel: '📊 Show Status Panel',
      trayHideStatusPanel: '📊 Hide Status Panel',
      traySwitchSkin: '🎨 Switch Skin',
      trayPauseWalk: '⏸️ Pause Walking',
      trayResumeWalk: '🚶 Resume Walking',
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
      trayPomodoroOpen: '🧘🏻‍♂️ Cang Qiong Seclusion',
      trayPomodoroRunning: '🧘🏻‍♂️ In Seclusion',
      trayPomodoroCompleted: '🧘🏻‍♂️ Seclusion Complete',
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
      pomodoroTitle: 'Cang Qiong Seclusion',
      pomodoroPin: 'Pin on top',
      pomodoroUnpin: 'Unpin',
      pomodoroClose: 'Close',
      pomodoroPrompt: 'Seclusion Duration',
      pomodoroDecrease: 'Decrease',
      pomodoroIncrease: 'Increase',
      pomodoroStart: 'Enter Seclusion',
      pomodoroStop: 'Exit Early',
      pomodoroCompleted: 'Seclusion Complete',
      pomodoroCompleteMessage: 'Seclusion complete. Your cultivation has advanced significantly.',
      pomodoroFinish: 'Exit Seclusion',

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
      bubbleFeedYueqi: '(Savoring…)',
      bubbleFeedShenjiu: '…Acceptable.',
      bubbleMeditateYueqi: 'Entering stillness…',
      bubbleMeditateShenjiu: '(eyes closed, gathering Qi)',
      bubblePetYueqi: '(smiles indulgently)',
      bubblePetShenjiu: '…Mind your own business.',
      bubbleRestYueqi: 'Taking a short break.',
      bubbleRestShenjiu: '(feigns sleep)',
      bubbleRestTooHungry: 'Too hungry to rest…',

      // Return welcome
      returnYueqi: (n) => `You were gone for ${n} shi-chen…`,
      returnShenjiu: '...hmph, you\'re finally back.',

      // Time phase chatter
      morningYueqi: 'Good morning.',
      morningShenjiu: 'Hmph, you\'re up early.',
      dayYueqi: 'The day is long. Do not overexert yourself.',
      dayShenjiu: '...It is broad daylight. Stop wandering around.',
      duskYueqi: 'It is dusk. Another day is ending.',
      duskShenjiu: 'It\'s getting dark.',
      eveningYueqi: 'Night has fallen, aren\'t you going to rest?',
      eveningShenjiu: '...Don\'t bother me, go to sleep.',
      nightYueqi: 'It is late. You should rest.',
      nightShenjiu: '...Still awake? Do you want to drop dead?',
    },
    dialogues: {
      // 🚧 Placeholder — will be replaced after official translation wordlist
      greet: {
        yueqi: [
          'Xiao Jiu, you are here too.',
          'Qingqiu Shidi, how are you today?',
          'Qingqiu Shidi, it has been a while.',
          'Xiao Jiu, want to take a walk together?',
          'Qingqiu Shidi, your complexion looks much better.',
        ],
        shenjiu: [
          '...Yue Qi.',
          '...Mm.',
          'Zhangmen Shixiong, I trust you have been well.',
          'Why are you here again?',
          'Hmph, such an idle man.',
        ],
      },
      shareFood: {
        yueqi: [
          'Xiao Jiu, this is for you.',
          'I am not hungry, you should eat more.',
          'Qingqiu, try this.',
        ],
        shenjiu: [
          '...Who wants your stuff.',
          '(Takes it silently)',
          'Hmph... barely palatable.',
        ],
      },
      cultivate: {
        yueqi: [
          'Xiao Jiu, let\'s cultivate together.',
          'Dual cultivation doubles the results with half the effort! ❤',
          'I shall guard you while you cultivate.',
        ],
        shenjiu: [
          'Cut the nonsense. Cultivate.',
          '...Don\'t lose focus.',
          '(Eyes closed, gathering Qi)',
        ],
      },
      kiss: {
        yueqi: [
          'Xiao Jiu...',
          'Qingqiu, I missed you so much.',
          'Let me get a little closer.',
        ],
        shenjiu: [
          '...Yue Qi, you...!',
          '(Tips of ears turning red)', // 耳尖微红
          '...Hmph.',
        ],
      },
      hug: {
        yueqi: [
          'Xiao Jiu, let me hold you for a moment.',
          'You are too thin.',
          'I will never let go again.',
        ],
        shenjiu: [
          '......',
          '(Does not push away)',
          '(Just like when we were kids)',
        ],
      },
      throwup: {
        // Fires when shareFood would overfill ShenJiu
        yueqi: [
          'Xiao Jiu, are you alright?!',
          'Xiao Jiu!!',
        ],
        shenjiu: [
          'Blegh~~ Are you trying to stuff me to death?!',
          'Enough! Eat it yourself!!',
          'I cannot take another bite!!',
        ],
      },
      idle: {
        yueqi: [
          'Where is Xiao Jiu...',
          'I should go review the official documents.',
          'It\'s time to cultivate.',
          '(Adjusting robes)', // 整理衣冠
          'The scenery of Cang Qiong Mountain is beautiful.', // 苍穹山
        ],
        shenjiu: [
          '(Flipping pages)',
          '...Annoying.',
          'How to break through the bottleneck?', // 突破瓶颈
          '(Gazing coldly into the distance)',
          'That person... didn\'t come.',
        ],
      },
      weather_rain: {
        yueqi: ['It\'s raining, don\'t catch a cold.', 'I wonder when the rain will stop.'],
        shenjiu: ['...Annoying rain.', '(Taking shelter)'],
      },
      weather_snow: {
        yueqi: ['It\'s snowing, remember to wear more clothes.', 'The snow is beautiful, but cold.'],
        shenjiu: ['...A bit cold.', '(Shrinking hands slightly)'],
      },
      weather_clear: {
        yueqi: ['The sun is great today, perfect for cultivation.', 'Clear sky and fresh air.'],
        shenjiu: ['The sun is glaring...', 'Not bad today.'],
      },
      weather_cloudy: {
        yueqi: ['It looks gloomy, the weather might change.', 'The wind is picking up.'],
        shenjiu: ['Cloudy days... make me sluggish.', '(The sky is gloomy)'],
      },
      weather_windy: {
        yueqi: ['The wind is strong, Xiao Jiu. Stay out of the draft.', 'The mountain wind is tugging at our sleeves.'],
        shenjiu: ['...The wind is noisy enough to be annoying.', '(Pulling sleeves closer)'],
      },
      weather_thunderstorm: {
        yueqi: ['The thunder is close. Xiao Jiu, do not be afraid.', 'This storm came quickly. Let us take shelter first.'],
        shenjiu: ['...It is only thunder. What is there to fear?', '(Frowning under the flash of lightning)'],
      },
      hungry: {
        yueqi: ['A bit hungry...', 'Time for a meal.'],
        shenjiu: ['...My stomach is growling.', 'Inedia should have its limits.'], // 辟谷的标准玄幻词是 Inedia 或 Fasting，Inedia 古风感更强
      },
      lowQi: {
        yueqi: ['Qi is running low.', 'Need to cultivate to recover.'],
        shenjiu: ['Insufficient Qi...', 'Time to cultivate.'],
      },
      lowMood: {
        yueqi: ['My state of mind is unstable...', 'Feeling a bit restless.'], // 心境不稳
        shenjiu: ['...Leave me alone.', '(Expressionless)'],
      },
      effects: {
        greet: '💬',
        shareFood: '🍎',
        cultivate: '✨',
        kiss: '💋',
        hug: '💕',
      },
      breakReminder: {
        yueqi: [
          'Stand up and move around. You\'ve been sitting too long.',
          'Even in cultivation, one must care for their physical body.',
          'Come, take a rest and walk around a bit.',
          'Persistence is admirable, but stretch your limbs.',
          'Stand up and stretch a little.',
        ],
        shenjiu: [
          '...Stop sitting there like a statue. Get up.',
          '(Stands up) You too.',
          'The body is the foundation of cultivation. Stop lounging around.',
          '...Hmph, I am merely reminding you in passing.',
          'Sitting too long harms the body. Walk, even if you won\'t cultivate.',
        ],
      },
    },
  },

  /* ================================================================
   * 日本語（古風・雅致）
   * ================================================================ */
  ja: {
    ui: {
      // 右クリックメニュー (右键菜单)
      feed: '🍎 食事',    // 避开宠物感的“食べさせる”和祭祀感的“供物”，赠送灵果最符合修仙日常
      meditate: '🧘🏻‍♂️ 打坐修行',    // 日文官方译本标准词汇，完美保留原汁原味
      petYueqi: '🤚 小九の甘え',    // “甘え（Amaeru）”是日文同人圈表达受向攻撒娇、傲娇依赖的灵魂词
      petShenjiu: '🤚 七哥の労わり',  // “労わり（Itawari）”指代带着怜惜与包容的安抚、顺毛，极度贴合七哥的性格
      rest: '💤 休息',          // 仙侠文中最常用的休息表达
      status: '📊 状態確認',      // 修仙者不看“状态”，看“修为（しゅうい）”

      // 状態パネル
      statusTitle: '状態',
      statAffection: '好感度',
      statHunger: '満腹度',
      statQi: '霊力',
      statMood: '道心',
      statusFooter: 'Make QiJiu Great Again!',

      // ペット名
      nameYueqi: '岳清源',
      nicknameYueqi: '岳七',
      nameShenjiu: '沈清秋',
      nicknameShenjiu: '沈九',

      // 装束名
      skinDefault: '既定装束・(絵師) Hamster Salad',  // “装束”比“スキン（Skin）”更有古风雅致的感觉，括号内保留英文艺术家署名以示尊重
      skinBirds: '小鳥七九・(絵師) Hamster Salad',
      skinAnimalEars: '猫兎七九・(絵師) Violetfirefly',

      // トレイメニュー
      trayTitle: '岳清源×沈清秋 デスクペット',
      trayShowStatusPanel: '📊 状態表示',
      trayHideStatusPanel: '📊 状態非表示',
      traySwitchSkin: '🎨 装束変更',      // “装束（しょうぞく）”完美平替现代外来语“スキン（Skin）皮肤”
      trayPauseWalk: '⏸️ 歩行停止',
      trayResumeWalk: '🚶 歩行再開',
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
      trayPomodoroOpen: '🧘🏻‍♂️ 蒼穹静修',
      trayPomodoroRunning: '🧘🏻‍♂️ 閉関中',
      trayPomodoroCompleted: '🧘🏻‍♂️ 静修円満',
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
      pomodoroTitle: '蒼穹静修',
      pomodoroPin: '最前面に固定',
      pomodoroUnpin: '固定を解除',
      pomodoroClose: '閉じる',
      pomodoroPrompt: '閉関期間',
      pomodoroDecrease: '減らす',
      pomodoroIncrease: '増やす',
      pomodoroStart: '静修開始',
      pomodoroStop: '早期出関',
      pomodoroCompleted: '静修円満',
      pomodoroCompleteMessage: '閉関終了。修行がまた一段と進みました。',
      pomodoroFinish: '出関',

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
      bubbleFeedYueqi: '（静かに味わう…）',
      bubbleFeedShenjiu: '…まあ、悪くはない。',
      bubbleMeditateYueqi: '入定…',
      bubbleMeditateShenjiu: '（目を閉じ、気を凝らす）',
      bubblePetYueqi: '（愛おしそうに微笑む）',
      bubblePetShenjiu: '…余計なお世話だ。',
      bubbleRestYueqi: 'しばし息を整える。',
      bubbleRestShenjiu: '（まどろむふり）',
      bubbleRestTooHungry: '空腹で休むに休めぬ…',

      // 帰還の挨拶
      returnYueqi: (n) => `此処を離れてより、${n}時辰が経ったよ…`,
      returnShenjiu: '…ふん、ようやく戻ってきたか。',

      // 時段の雑談
      morningYueqi: 'おはようございます。',
      morningShenjiu: 'ふん、起きるのが早いな。',
      dayYueqi: 'まだ日は高い。あまり無理をしないように。',
      dayShenjiu: '…真昼間から、うろちょろするな。',
      duskYueqi: '夕暮れだ。また一日が終わるね。',
      duskShenjiu: '日が暮れたな。',
      eveningYueqi: '夜が更けた。まだ休まないのか。',
      eveningShenjiu: '…煩わしい、さっさと寝ろ。',
      nightYueqi: 'もうこんな時間だ。早く休むといい。',
      nightShenjiu: '…まだ起きているのか？死ぬ気か。',
    },
    dialogues: {
      greet: {
        yueqi: [
          '小九、君もここにいたのか。',          // 小九，你也在这里。
          '清秋師弟、本日の調子はどうだい？',     // 清秋师弟，今日可好？（温柔关切）
          '清秋師弟、久しぶりだね。',            // 清秋师弟，许久不见。
          '小九、少し一緒に歩かないか？',        // 小九，要一起走走吗？
          '清秋師弟、顔色が随分と良くなったね。', // 清秋师弟，你的气色好了许多。
        ],
        shenjiu: [
          '岳七。',
          '…ああ。',                          // …嗯。（比“うん”更清冷稳重）
          '掌門師兄、お変わりなく。',            // 掌门师兄，别来无恙。（极其标准的疏离感）
          'なぜまた来たんだ。',                  // 你怎么又来了。
          'ふん、暇な奴だ。',                    // 哼，闲人一个。
        ],
      },
      shareFood: {
        yueqi: [
          '小九、これをお食べ。',                // 小九，这个给你吃。（“お食べ”有种长辈/师兄哄着投喂的宠溺感）
          '私は空いていないから、もっと食べるといい。', // 我不饿，你多吃一些。
          '清秋、これを食べてごらん。',          // 清秋，尝尝这个。
        ],
        shenjiu: [
          '…誰がお前の物など。',                // …谁要你的东西。
          '（無言で受け取る）',                  // （默默接过）
          'ふん…まあ、食えなくはない。',          // 哼…还算能入口。
        ],
      },
      cultivate: {
        yueqi: [
          '小九、共に修行しよう。',              // 小九，一起修炼吧。（修行）
          '双修なら事半功倍だよ❤',              // 双修能事半功倍❤（“事半功倍”日文中也有这个四字熟语，修仙文常用）
          '私が護法を務めよう。',                // 我来为你护法。（“護法を務める”是最地道的仙侠翻译）
        ],
        shenjiu: [
          '御託はいい、打坐だ。',                // 少废话，打坐。（“御託はいい” = 废话少说）
          '…気を散らすな。',                    // …别分心。
          '（目を閉じ、気を凝らす）',            // （闭目凝神）（沿用之前敲定的绝佳翻译）
        ],
      },
      kiss: {
        yueqi: [
          '小九…',
          '清秋、ずっと会いたかった。',          // 清秋，我很想你。（表达一种长久以来的思念）
          'もう少し、近づかせておくれ。',        // 让我靠近一点。
        ],
        shenjiu: [
          '…岳七、お前…！',
          '（耳の先を赤らめる）',                // （耳尖微红）
          '…ふん。',
        ],
      },
      hug: {
        yueqi: [
          '小九、少し抱きしめさせて。',          // 小九，让我抱一下。
          '君は細すぎる…',                      // 你太瘦了。（用“細い”比“痩せる”更有那种让人心疼的骨感）
          'もう二度と、手放しはしない。',        // 不会再放手了。
        ],
        shenjiu: [
          '……',
          '（押し退けない）',                    // （没有推开）（傲娇放弃抵抗的灵魂动作）
          '（幼い頃のように）',                  // （就像小时候那样）
        ],
      },
      throwup: {
        // 分食時に高胤が上限超えで発生
        yueqi: [
          '小九、どうしたんだ？！',
          '小九！！',
        ],
        shenjiu: [
          'うっ…！無理やり食わせて殺す気か？！',
          'もういい！自分で食え！！',
          'これ以上は一口も入らん！！',
        ],
      },
      idle: {
        yueqi: [
          '小九はどこにいるんだろう…',          // 小九在哪里呢…
          '公務を処理しに行かねば。',
          'そろそろ修行に行くとするか。',
          '（身なりを整える）',                  // （整理衣冠）
          '蒼穹山の景色は本当に美しい。',        // 苍穹山的风景真好。
        ],
        shenjiu: [
          '（書物をめくる）',                      // （翻书）
          '…煩わしい。',                        // …烦。（“煩わしい”比直白的“うるさい”更有清冷仙长的心境）
          'どうやって修行の限界を突破するか…',        // 如何突破瓶颈？（“瓶頸（へいけい）”是修真原汁原味的词）
          '（冷ややかな目で彼方を見遣る）',      // （冷冷地看着远方）
          'あの人…また来なかった。',              // 那个人…又没来。（“あの人”比直呼其名多了很多幽怨和隐藏的期待）
        ],
      },
      weather_rain: {
        yueqi: ['雨が降ってきた、小九、風邪を引かないように。', 'この雨、いつ止むのだろうか。'],
        shenjiu: ['…忌々しい雨だ。', '（軒下で雨宿り）'],
      },
      weather_snow: {
        yueqi: ['雪が降ってきた、着込むのを忘れないように。', '雪景色は美しいが、やはり冷えるな。'],
        shenjiu: ['…少し寒いな。', '（微かに手を縮める）'],
      },
      weather_clear: {
        yueqi: ['今日は日差しが良い、修行には最適だ。', '空が晴れ渡り、空気が澄んでいる。'],
        shenjiu: ['日差しが眩しい…', 'まあ、悪くない天気だ。'],
      },
      weather_cloudy: {
        yueqi: ['空が淀んでいる、天気が崩れそうだな。', '風が出てきたな。'],
        shenjiu: ['曇り空は…気が滅入る。', '（空がどんよりとしている）'],
      },
      weather_windy: {
        yueqi: ['風が強いな、小九、風口には立たぬように。', '山風が急で、袖まで乱れてしまうな。'],
        shenjiu: ['…風の音が耳障りだ。', '（袖を引き寄せる）'],
      },
      weather_thunderstorm: {
        yueqi: ['雷が近いな。小九、怖がらなくていい。', 'この雷雨は急だ、まず避けよう。'],
        shenjiu: ['…雷くらいで騒ぐな。', '（稲光に眉をひそめる）'],
      },
      hungry: {
        yueqi: ['少し腹が減ったな…', '膳の時間か。'], // 有些饿了… / 该用膳了。（“膳の時間”很有古风日常感）
        shenjiu: ['…腹が鳴った。', '辟穀にも限度があるだろう。'], // …肚子叫了。 / 辟谷也该有个限度。（辟穀：へきこく）
      },
      lowQi: {
        yueqi: ['霊力がもうすぐ底を尽きそうだ。', '打坐して回復しなければ。'],
        shenjiu: ['霊力が足りない…', '修行の時間だな。'],
      },
      lowMood: {
        yueqi: ['道心が揺らいでいる…', '心がざわつく。'], // 心境不稳… / 有些心烦。（“ざわつく”形容心里毛毛的、无法平静）
        shenjiu: ['…構うな。', '（無表情）'],             // …别烦我。（“構うな” = 别管我/别烦我） / （面无表情）
      },
      effects: {
        greet: '💬',
        shareFood: '🍎',
        cultivate: '✨',
        kiss: '💋',
        hug: '💕',
      },
      breakReminder: {
        yueqi: [
          '立って少し歩くといい、随分長く座っているよ。',                // 起来走走吧，你已经坐很久了。（语气轻柔温和）
          '修行においても、身体を労わらなければ。',                      // 修行也要注意体魄。（“労わる”体现七哥的关心）
          'さあ、少し休んで、立って歩いてごらん。',                      // 来，休息一下，起身走走。（“〜てごらん”有哄着对方的感觉）
          '修行に励むのは良いことだが、筋骨も動かさないとね。',          // 坚持修炼是好事，但也要活动筋骨。（筋骨：きんこつ）
          '立ち上がって、少し背伸びをしてごらん。',                      // 站起来伸展一下吧。
        ],
        shenjiu: [
          '…いつまで座っているつもりだ。立って少し動け。',               // …别死坐着了，起来活动活动。（清冷命令式）
          '（立ち上がり）お前も立て。',                                  // （站起来）你也起来。
          '体は修行の根基だ、いつまでも怠けているな。',                  // 身体是修炼的根基，别赖着不动。（根基：こんき，纯正修真词汇）
          '…ふん、ついでの忠告だ。勘違いするな。',                       // …哼，我只是顺便提醒你一下。（稍微润色加了一句“别误会”，把傲娇度拉满！）
          '長座は体を痛める。修行する気がないなら、少しは歩け。',        // 久坐伤身，不想修练也得走两步。（長座：ちょうざ，久坐的古雅说法）
        ],
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
        trayDesc: ui.statusFooter,
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
