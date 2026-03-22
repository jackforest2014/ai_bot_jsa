# 1. 现在如何用一个 curl 请求来试验一下能否使用高德地图的路径规划的免费额度的api？

您可以通过以下 `curl` 命令测试高德地图路径规划 API 的免费额度是否可用。**前提是您已在高德开放平台注册并获取了 API Key**，且尚未开启签名校验（或已按签名方式构造请求）。

---

### 一、测试驾车路径规划 API

#### 1. 构造请求 URL
高德驾车路径规划 API 的请求格式：
```
https://restapi.amap.com/v3/direction/driving?origin=经度,纬度&destination=经度,纬度&key=您的API_KEY&output=JSON
```

#### 2. 示例 curl 命令（替换 `YOUR_KEY`）
```bash
curl "https://restapi.amap.com/v3/direction/driving?origin=116.397128,39.916527&destination=116.403963,39.915119&key=YOUR_KEY&output=JSON"
```
- `origin`: 起点坐标（经度,纬度），此处为天安门
- `destination`: 终点坐标，此处为故宫东华门
- `output`: 返回格式，JSON 或 XML

#### 3. 预期返回结果（成功）
```json
{
  "status": "1",
  "info": "OK",
  "route": {
    "paths": [ ... ],
    "origin": "116.397128,39.916527",
    "destination": "116.403963,39.915119"
  }
}
```
- `status` 为 `1` 表示调用成功，说明您的 API Key 有效且免费额度尚有剩余。

---

### 二、免费额度如何体现？

- **调用次数**：个人开发者免费配额通常为 **每日 3 万次**（路径规划类 API），具体可在控制台 **“配额管理”** 中查看。  
- **本次调用会消耗一次配额**，您可以在 **“配额管理”** → **“调用记录”** 中看到此次请求。  
- 若免费额度已用完，返回的 `status` 将为 `0`，`info` 会提示 `QUOTA_EXCEEDED`。

---

### 三、常见问题与错误码

| 返回错误 | 含义及解决方法 |
|---------|--------------|
| `INVALID_USER_KEY` | API Key 无效，请检查是否复制正确，或该 Key 未开启路径规划服务。 |
| `DAILY_QUOTA_EXCEED` | 当日调用次数已超免费限额，请次日再试或购买更高配额。 |
| `MISSING_REQUIRED_PARAMS` | 缺少必要参数，检查 `origin` 和 `destination` 是否都提供了。 |
| `UNKNOWN_ERROR` | 临时错误，稍后重试。 |

---

### 四、如果开启了签名校验

如果您在控制台为 Key 开启了签名校验（`签名方式` 选为 MD5），则需要在请求中增加 `sig` 参数，**不能**直接使用上述 curl。  
此时需要按规则计算签名（参见之前提供的签名方案），构造 URL 类似：
```
https://restapi.amap.com/v3/direction/driving?origin=...&destination=...&key=YOUR_KEY&sig=MD5_SIGNATURE
```
然后用 curl 发送即可。

---

### 五、其他路径规划 API 测试

您也可以测试步行、公交等 API，只需更换路径：
- **步行**：`/v3/direction/walking`
- **公交**：`/v3/direction/transit/integrated`

参数类似。

---

执行上述命令后，如果返回 `status: "1"`，则说明您的 API Key 可用且免费额度正常，可以放心集成到项目中了。


# 2. 如何将地址转换为经纬度坐标？

高德地图的 **路径规划 API**（包括驾车、步行、公交等）**本身不支持直接传入地址名称**，它只接受 **经纬度坐标** 作为起点和终点。  
要支持用户输入地址名称（如“天安门”、“北京南站”），您需要先调用 **地理编码 API** 将地址转换为坐标，然后再调用路径规划 API。

---

## 一、地理编码 API（地址 → 坐标）

高德提供了 **地理编码** 服务，可将地址名称转换为经纬度，且**在免费额度内**（个人开发者每日约 30 万次免费调用）。

### 请求示例
```bash
curl "https://restapi.amap.com/v3/geocode/geo?address=天安门&key=YOUR_KEY"
```

### 返回结果
```json
{
  "status": "1",
  "geocodes": [
    {
      "location": "116.397128,39.916527",
      "level": "地名",
      "formatted_address": "北京市东城区天安门"
    }
  ]
}
```
- `location` 字段即为经纬度坐标。

---

## 二、完整流程：地址 → 路线

在您的后端工具中，可以组合两个 API：

1. **用户输入**：起点地址、终点地址（例如 `"北京南站"`, `"天安门"`）
2. **地理编码**：分别调用地理编码 API，获取起点和终点的坐标
3. **路径规划**：用坐标调用路径规划 API，返回路线信息

### 示例代码片段（TypeScript）

```typescript
async function getRoute(originAddr: string, destAddr: string) {
  // 1. 地理编码
  const geocode = async (addr: string) => {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(addr)}&key=${env.AMAP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === '1' && data.geocodes.length) {
      return data.geocodes[0].location; // "经度,纬度"
    }
    throw new Error(`地址解析失败: ${addr}`);
  };

  const [originLoc, destLoc] = await Promise.all([
    geocode(originAddr),
    geocode(destAddr)
  ]);

  // 2. 路径规划
  const drivingUrl = `https://restapi.amap.com/v3/direction/driving?origin=${originLoc}&destination=${destLoc}&key=${env.AMAP_KEY}`;
  const routeRes = await fetch(drivingUrl);
  return await routeRes.json();
}
```

---

## 三、免费额度与注意事项

| API | 免费额度（个人开发者） | 说明 |
|-----|----------------------|------|
| 地理编码 | 约 30 万次/日 | 每个地址名称消耗一次 |
| 路径规划 | 约 3 万次/日 | 每次请求消耗一次 |

- 两者都**计入各自的免费额度**，不会相互占用。
- 如果开启了 **签名校验**，地理编码 API 同样需要携带 `sig` 参数，计算规则与路径规划一致。
- 为避免地址名称中的特殊字符（如空格、中文）导致请求失败，务必使用 `encodeURIComponent` 编码。

---

## 四、集成到您的 Agent 工具中

您可以在 `SearchTool` 之外单独实现一个 **高德地图工具**，包含两个子能力：
- `geocode(address)` → 返回坐标
- `route(origin, destination)` → 返回路线（可接受地址或坐标）

在用户对话中，当需要查询路线时，Agent 调用该工具，内部自动完成地址解析。

---

## 五、测试地理编码免费额度

您可以直接用 curl 测试地理编码：

```bash
curl "https://restapi.amap.com/v3/geocode/geo?address=北京南站&key=YOUR_KEY"
```

如果返回 `status: "1"`，则说明免费额度可用。


# 3. 提供出发地和目的地地址后，如何调用高德地图的 api 生成可以查看的路线规划链接？以及生成一个图片链接可以嵌入在富文本里展示的？

您可以通过以下两种方式，将用户提供的出发地和目的地地址，转化为可交互的路线规划链接和可嵌入的静态地图图片。

---

## 一、生成可点击的路线规划链接

高德地图提供了 **URI Scheme** 协议，可以直接生成在浏览器中打开的路线规划页面。您无需调用 API，只需构造一个特定格式的 URL。

### 1.1 基本格式（地址模式）
```http
https://uri.amap.com/navigation?to=目的地地址&from=出发地地址&mode=drive&callnative=0
```

| 参数 | 说明 | 示例 |
|------|------|------|
| `from` | 起点地址（可选，不填则默认用户当前位置） | `from=北京南站` |
| `to` | 终点地址（必填） | `to=天安门` |
| `mode` | 出行方式：`drive`（驾车）、`bus`（公交）、`walk`（步行）、`bike`（骑行） | `mode=drive` |
| `callnative` | 是否尝试唤起高德地图 App（`1` 唤起，`0` 仅在浏览器中打开） | `callnative=0` |

**示例**（北京南站 → 天安门）：
```
https://uri.amap.com/navigation?to=天安门&from=北京南站&mode=drive&callnative=0
```

### 1.2 坐标模式（更精确）
如果您已经获取了出发地和目的地的经纬度，可以使用坐标模式：
```http
https://uri.amap.com/navigation?to=经度,纬度&from=经度,纬度&mode=drive&callnative=0
```
例如：
```
https://uri.amap.com/navigation?to=116.397128,39.916527&from=116.378527,39.865742&mode=drive
```

### 1.3 后端集成建议
- 如果用户输入的是地址名称，您无需再调用地理编码，因为高德 URI 会自动解析地址（但精度略差）。
- 如果您希望提高定位准确性，可以先调用高德地理编码 API 获取坐标，再使用坐标模式生成链接。

**返回给前端的 Markdown**：
```markdown
[点击查看驾车路线](https://uri.amap.com/navigation?to=天安门&from=北京南站&mode=drive)
```

---

## 二、生成可嵌入的静态地图图片

高德地图静态图 API 可以生成一张路线规划图片，直接嵌入到您的聊天界面中。

### 2.1 静态图 API 请求格式
```http
https://restapi.amap.com/v3/staticmap?parameters
```

### 2.2 关键参数说明
| 参数 | 说明 | 示例/要求 |
|------|------|----------|
| `key` | 您的 API Key | 必填 |
| `location` | 地图中心点（经度,纬度） | 建议设为路线中心点 |
| `zoom` | 缩放级别（3-18） | 根据路线长度自动调整，可固定 12 |
| `size` | 图片尺寸（宽*高） | 如 `750*400`，最大 1024*1024 |
| `markers` | 标记点（起点、终点） | 格式 `mid,0xFFFFFF,0:经度,纬度` |
| `paths` | 路线（坐标串） | `weight:5,color:0x00FF00|经度1,纬度1;经度2,纬度2` |

### 2.3 完整步骤（需两次调用）

**第一步：获取路线坐标串**  
调用高德路径规划 API（驾车/公交等），获取 `route.paths[0].steps` 中的坐标点，拼接成 `经度,纬度;经度,纬度` 的格式。

**第二步：构造静态图 URL**  
将坐标串作为 `paths` 参数，同时用 `markers` 标记起点和终点。

#### 示例请求（驾车路线静态图）
假设您已经通过路径规划 API 获得了路线坐标串：
```
116.397128,39.916527;116.403963,39.915119;... (多个点)
```

静态图 URL：
```
https://restapi.amap.com/v3/staticmap?
  key=YOUR_KEY&
  size=750*400&
  zoom=12&
  markers=small,0xFF0000,0:116.397128,39.916527&
  markers=small,0x00FF00,0:116.403963,39.915119&
  paths=weight:5,color:0x0000FF|116.397128,39.916527;116.403963,39.915119
```

### 2.4 注意事项
- 静态图 API 是**付费服务**（但通常有免费额度，个人开发者约 100 次/日）。
- 如果路线点过多（超过 100 个），需要降采样，否则 API 可能拒绝。
- 您可以在后端生成图片 URL，返回给前端 `<img src="...">` 直接渲染。

### 2.5 简化方案（仅显示起点和终点）
如果不需要完整路线，可以只用两个 `markers` 标记起点和终点，并自动缩放地图：
```http
https://restapi.amap.com/v3/staticmap?key=YOUR_KEY&size=750*400&markers=mid,0xFF0000,0:起点坐标&markers=mid,0x00FF00,0:终点坐标&zoom=auto
```

---

## 三、后端工具集成示例（TypeScript）

以下是一个完整的高德路线工具，它接收地址，返回路线链接和静态图 URL。

```typescript
interface RouteResult {
  link: string;      // 可点击的路线链接
  staticMapUrl: string; // 静态地图图片 URL
}

async function getRoute(origin: string, destination: string): Promise<RouteResult> {
  const AMAP_KEY = env.AMAP_KEY;
  const AMAP_SECRET = env.AMAP_SECRET; // 如果开启签名

  // 1. 地理编码（获取坐标）
  const geocode = async (addr: string) => {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(addr)}&key=${AMAP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== '1') throw new Error(`地址解析失败: ${addr}`);
    return data.geocodes[0].location;
  };

  const [originLoc, destLoc] = await Promise.all([geocode(origin), geocode(destination)]);
  const [originLng, originLat] = originLoc.split(',');
  const [destLng, destLat] = destLoc.split(',');

  // 2. 驾车路径规划（获取路线坐标串）
  const drivingUrl = `https://restapi.amap.com/v3/direction/driving?origin=${originLoc}&destination=${destLoc}&key=${AMAP_KEY}&extensions=all`;
  const drivingRes = await fetch(drivingUrl);
  const drivingData = await drivingRes.json();
  if (drivingData.status !== '1') throw new Error('路线规划失败');

  // 提取路线坐标点（polyline）
  const steps = drivingData.route.paths[0].steps;
  const points: string[] = [];
  points.push(originLoc);
  for (const step of steps) {
    const polyline = step.polyline; // "lng1,lat1;lng2,lat2"
    if (polyline) points.push(...polyline.split(';'));
  }
  points.push(destLoc);
  const pathStr = points.join(';');

  // 3. 生成静态图 URL
  const staticMapUrl = `https://restapi.amap.com/v3/staticmap?` +
    `key=${AMAP_KEY}&size=750*400&zoom=12&` +
    `markers=small,0xFF0000,0:${originLoc}&` +
    `markers=small,0x00FF00,0:${destLoc}&` +
    `paths=weight:5,color:0x0000FF|${pathStr}`;

  // 4. 生成可点击链接（使用坐标模式更精确）
  const link = `https://uri.amap.com/navigation?to=${destLoc}&from=${originLoc}&mode=drive&callnative=0`;

  return { link, staticMapUrl };
}
```

在对话中返回 Markdown：
```markdown
为您规划了驾车路线：[点击查看详情](${link})  
![路线示意图](${staticMapUrl})
```

---

## 四、免费额度与注意事项

| 服务 | 免费额度（个人开发者） | 说明 |
|------|----------------------|------|
| 地理编码 | ~30 万次/日 | 每个地址名称消耗一次 |
| 路径规划 | ~3 万次/日 | 每次请求消耗一次 |
| 静态图 | ~100 次/日（部分套餐） | 若超限可改用 URI 链接代替 |
| URI 链接 | 不限 | 无调用限制，仅生成 URL |

- 静态图 API 建议仅在关键对话中启用，普通情况下只提供可点击链接即可。
- 如果担心免费额度不足，可以只返回 URI 链接，让用户点击后在高德地图 App 或网页中查看。

通过以上方案，您可以在对话中优雅地展示路线规划结果，同时控制后端调用成本。


# 4. mode参数除了 drive，还有哪些可用？

您观察得很仔细。直接从浏览器访问您构造的地址链接确实可能无效，因为高德 URI Scheme 对地址名称的解析支持不够稳定。**推荐做法是先通过地理编码 API 将地址转换为坐标，再使用坐标模式生成链接**。

另外，`mode` 参数支持多种出行方式，以下是完整列表：

| 参数值 | 出行方式 | 说明 |
|--------|----------|------|
| `drive` | 驾车 | 默认选项 |
| `bus` | 公交 | 包含地铁、公交等公共交通组合 |
| `walk` | 步行 | |
| `bike` | 骑行 | 需高德地图 App 支持 |
| `truck` | 货车 | 需企业开发者权限 |
| `motor` | 摩托车 | 需企业开发者权限 |
| `car` | 驾车 | 与 `drive` 相同（历史保留） |
| `subway` | 地铁 | 部分版本支持，建议使用 `bus` 自动包含 |

---

## 正确的可点击链接生成方法（坐标模式）

### 步骤一：调用地理编码 API 获取坐标
```bash
curl "https://restapi.amap.com/v3/geocode/geo?address=北京南站&key=YOUR_KEY"
```
返回示例：
```json
{
  "geocodes": [{"location": "116.378527,39.865742"}]
}
```

### 步骤二：构造坐标模式链接
```http
https://uri.amap.com/navigation?to=116.397128,39.916527&from=116.378527,39.865742&mode=drive
```

### 步骤三：完整后端实现（TypeScript）
```typescript
async function generateAmapLink(origin: string, destination: string, mode = 'drive') {
  // 1. 地理编码（可缓存）
  const geocode = async (addr: string) => {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(addr)}&key=${env.AMAP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== '1' || !data.geocodes?.length) {
      throw new Error(`地址解析失败: ${addr}`);
    }
    return data.geocodes[0].location;
  };

  const [originLoc, destLoc] = await Promise.all([geocode(origin), geocode(destination)]);
  return `https://uri.amap.com/navigation?to=${destLoc}&from=${originLoc}&mode=${mode}&callnative=0`;
}
```

### 测试验证
生成的链接类似：
```
https://uri.amap.com/navigation?to=116.397128,39.916527&from=116.378527,39.865742&mode=drive
```
在浏览器中打开，会直接显示从北京南站到天安门的驾车路线。

---

## 为什么地址模式不稳定？

高德 URI Scheme 对地址名称的解析依赖于客户端（浏览器或 App）的本地地理编码能力，而不同设备、不同浏览器的解析效果差异很大。使用**坐标模式**可以完全绕过这一不确定性，确保链接在所有设备上都能正常工作。

---

## 前端展示建议

在对话中返回 Markdown：
```markdown
[点击查看驾车路线](https://uri.amap.com/navigation?to=116.397128,39.916527&from=116.378527,39.865742&mode=drive)
```
如果同时需要静态地图图片，可参考上一轮的静态图方案生成图片嵌入。
