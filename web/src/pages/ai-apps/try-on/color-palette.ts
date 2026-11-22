// 来源：用户指定页面的公开 image_color/query_list 色库，221 色／16 组；不代表实物标准色卡。
const group = (name: string, entries: string) => ({ name, colors: entries.split(" ").map((entry) => { const [label, hex] = entry.split(":"); return { name: label, hex: `#${hex}` }; }) });
export const colorPalette = [
    group("黄色", "杏仁油色:F2E8C2 法国香草:F0E1A5 柠檬色:F8DF5F 亮浅黄:EFED98 阳光黄:FDE182 电子黄:FFD300 黄褐色:E4BB25 毛茛黄:FBE337 雾黄色:DBB960 橄榄油色:AD8D30 琥珀绿:9F873F 青金色:B49B57 猎犬色:76563C"),
    group("橘黄色", "深草黄:ECD6A3 暮金色:FAC668 太阳能色:F8C747 柠檬铬黄:FFC600 鲜橘黄:FFB100 蜂蜡色:EEA94A 金秋黄:E9A916 金光色:DE9E36 蜜黄色:CC9350 琥珀金:BC8E48 苏丹褐:A96D35 饼干色:B6855A 野牛色:664D3B"),
    group("橙色", "苹果花色:E4C4A7 沙尘色:E5BD8E 旭日色:FBC58C 亮橘黄:FB9D18 火焰橙:FC8A17 橙皮色:FE7D31 橙褐色:E5761F 金土色:E09D66 山药色:D38B3B 浅杏黄色:CF7D49 皮革褐:935635 浅咖啡色:A9806A 画眉色:916B53 棕褐色:6E493B 深红褐色:64413D"),
    group("橙红色", "桃白色:FBD1BB 绒桃色:FFC196 杏粉色:F9B086 鲑粉色:F6AC97 浅杏色:E5B49A 沙岩色:C78D6B 珊瑚金:D78257 橘色:F79256 胡萝卜色:F86A38 橙红色:E74D3A 焦橙色:C7622B 铜色:AD6B4E 铜币色:A45641 摩卡黄:8A553F 烧砖色:723838"),
    group("红色", "山茱萸粉:F6D6D8 杏花粉:F5BFCC 海贝粉:F8CBC7 桃乳色:F5A8A5 珊瑚杏仁:E29892 海螺壳色:FB8C98 红瓷釉色:E46A6D 火珊瑚色:FF8272 深桔色:D5392C 火红:D12631 巴贝多樱桃色:AE1932 浆果红:B34A5E 锈橙色:C35D48 火砖色:A04E42 峡谷玫瑰色:B06F6B"),
    group("紫红色", "极光粉:E680AA 海棠:B33A7F 桃红色:CC397B 亮粉色:E95985 杜鹃红:D3305D 爵士红:B62756 银莲花色:862C4D 洋紫色:723157 大丽花红:812630 红棕色:865058 深紫红色:603E4F 勃艮第酒红:653B47 兰花紫:B37E9A 波利尼亚克:C0889D 丁香粉:EAB0CE"),
    group("紫色", "淡薰衣草紫:DBA4CC 艳紫色:9F4284 天竺牡丹:864483 夹竹桃:713867 葡萄紫:7E5581 明亮紫:794784 皇家紫:754C90 洋李色:5C3960 黑紫:4C2D4C 无花果色:503643 薄纱紫:C693C7 羽扇豆:BEA0C8 淡紫雾色:D5C9DD 薰衣草花语:B091AA"),
    group("蓝紫色", "薰衣草紫:747CA8 光谱蓝:3E4081 鸢尾蓝:5B5EA6 蓝花楹:8690CB 科西嘉蓝:656398 鲜亮蓝:4E468B 郁金香:9B90C8 故宫紫:594577 珠宝紫:473053 宇宙紫:503F57 夜蓝:312F48 雾色丁香:BCB8C9 子弹银:8788A2 丁香灰:9993B3 蓝鹭:9FABD2"),
    group("蓝色", "牵牛花蓝:BAD1E1 美人鱼蓝:9BC6D8 德雷斯顿蓝:0088C3 海港:005F82 亮钴蓝:355E91 维多利亚蓝:155DA4 炫目蓝:284DA7 深蓝色:2F407A 海岸蓝:4D5D83 石洗蓝:7683A0 深靛蓝:374051 波塞冬:29425F 花冠蓝:51718F 黛拉罗比亚:759ACD 蓝铃草色:92B5D9"),
    group("黑色", "龙葵紫:3F3949 黑咖啡色:3D383B 印度墨:3C434E 暗军蓝:32353D 乌黑:353635 陨石色:353335 酱黑色:2C2F32"),
    group("白色", "亮白:FFFFFF 雾白:E6EAE5 鹭白:EFEEE5 珍珠白:F5F0CE 冬白色:F2EDD8 香雪球:F1EEED 蓝晕色:D6DFDC 水洗白:E1E8E3"),
    group("灰色", "鸽羽色:AEAAA5 羽毛灰:B9B0A1 苜蓿色:BABAA4 幼鹿色:B09793 枫糖色:C9A48E 纪念紫:C4AAB5 暮光紫:896F73 山脊灰:7B7282 沥青色:4B4B50 炭灰色:6A6A6A 暴雨灰:5E6B73 素影灰:6A6B71 暴雨色:868485 建筑灰:ABB1B3 象皮色:908D87"),
    group("卡其色", "牡蛎白:D7CEB3 卵石色:D3C09B 石灰石:B5A083 自然色:AE927C 蘑菇色:8C8076 咖啡色:6A5542 茶棕色:927141 酱色:7E602A 暗金色:846D3D 树丛绿:7D745E 淡橄榄色:A89E81 咖喱色:BC9C69 面包色:BFA57E 新麦色:DAB77E"),
    group("蓝绿色", "海湾灰:A7C4BD 铅色:76888F 水蓝色:A1DDDD 尼罗蓝:78A9AD 水族蓝:63A2B0 卡普里岛色:00899D 热带绿:008B87 海港蓝:006F7A 潮水绿:006B64 香脂蓝:375A60 午夜蓝:315D78 天青蓝:066B8B 河蓝色:3BB3D0 羽蓝色:A5D3DB 轻语蓝:CAE0E1"),
    group("绿色", "猫眼石绿:C6E2DA 甘蓝绿:88DDBF 阿卡迪亚绿:00A989 陶瓷绿:00AFAC 荫绿色:007560 布拉尼绿:00AC78 清灰绿:7EB58C 孔雀石:679884 岛屿绿:1FB566 玛瑙绿:007F4A 绿豆灰:708C66 暗绿色:335045 云杉绿:486E69 烟灰绿:84958D 微绿色:B1CBBA"),
    group("黄绿色", "菊苣色:D8D37D 黄芹色:D3C54D 浅秋香:A89A51 酸草黄:E2EE83 硫磺色:D3D70D 黄草绿:ACB350 嫩芽绿:B9D146 鹦鹉绿:8FB34C 茉莉绿:81CC45 草地绿:6D9654 草蜢绿:707C43 橄榄绿:575447 墨绿色:6D7356 天堂绿:B6EBA0 微光绿:C2D4B2 莴苣绿:BFD58E 尼罗河绿:B4BD86"),
];

export type ColorEditOptions = { mode: "palette" | "reference"; hex: string; target: string; fidelity: boolean };
export const defaultColorEdit: ColorEditOptions = { mode: "palette", hex: "#BAD1E1", target: "主服装", fidelity: false };
export const validColorHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
export function filterPalette(category: string, query: string) {
    return colorPalette.filter((item) => !category || item.name === category).map((item) => ({ ...item, colors: item.colors.filter((color) => `${color.name} ${color.hex}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter((item) => item.colors.length);
}
