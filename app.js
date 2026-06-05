const valuations = [
  {
    aliases: ["9 mcintosh st oakleigh", "9 mcintosh street oakleigh"],
    relatedUnitNumbers: ["1", "2"],
    address: "9 McIntosh Street, Oakleigh VIC 3166",
    type: "House",
    value: "$1.14m - $1.36m",
    midpoint: "$1.25m",
    midpointValue: 1250000,
    confidence: "Low-Medium",
    status: "Low-Medium",
    reasons: [
      "3 / 2 / 2 house with strong rental support.",
      "530 sqm land is portal-provided, not title-confirmed.",
      "Related addresses 1/9 and 2/9 require title review.",
      "Quiet and convenient Oakleigh street."
    ],
    reasonsZh: [
      "3房2卫2车位，租金支撑较强。",
      "530 平方米土地来自门户网站，未由产权文件确认。",
      "相关地址 1/9 和 2/9 需要产权审查。",
      "Oakleigh 安静且便利的街道。"
    ],
    comparables: [
      ["170 Atherton Road", "$1.1555m", "Mar 2026", "466 sqm", "3 / 2 / 2", "Good"],
      ["191 Huntingdale Road", "$1.245m", "Mar 2026", "544 sqm", "3 / 2 / 3", "Good"],
      ["2 Norfolk Avenue", "$1.2925m", "Mar 2026", "352 sqm", "3 / 2 / 3", "Medium"]
    ],
    location: {
      rank: "Top 25% to Middle 50%, estimated",
      type: "Quiet mixed house / villa street",
      amenity: "Strong",
      parking: "Low to moderate",
      rankZh: "区内前 25% 到中间 50%，估算",
      typeZh: "安静的独立屋 / 别墅混合街道",
      amenityZh: "强",
      parkingZh: "低到中等"
    },
    suburb: [
      "Oakleigh has strong transport, retail and rental demand.",
      "McIntosh Street has mixed house, villa and townhouse stock.",
      "Land/title ambiguity keeps confidence lower."
    ],
    suburbZh: [
      "Oakleigh 交通、零售和租赁需求较强。",
      "McIntosh Street 有独立屋、别墅和联排住宅混合存量。",
      "土地和产权不确定性使置信度降低。"
    ],
    planning: {
      landSource: "Portal only, conflict risk",
      granny: "Low to Medium",
      approval: "Not approved",
      landSourceZh: "仅门户网站来源，有冲突风险",
      grannyZh: "低到中等",
      approvalZh: "未获批准"
    },
    map: {
      target: "9",
      station: "Oakleigh Station",
      shops: "Eaton Mall",
      stationZh: "Oakleigh 火车站",
      shopsZh: "Eaton Mall 商场"
    }
  },
  {
    aliases: ["18 moresby st oakleigh south", "18 moresby street oakleigh south"],
    address: "18 Moresby Street, Oakleigh South VIC 3167",
    type: "House",
    value: "$1.34m - $1.48m",
    midpoint: "$1.41m",
    midpointValue: 1410000,
    confidence: "Medium",
    status: "Medium",
    reasons: [
      "4 / 2 / 2 family house profile.",
      "530 sqm user-confirmed land size.",
      "Same-street guide evidence supports mid-$1.3m to $1.4m.",
      "Title, overlays and current condition still need confirmation."
    ],
    reasonsZh: [
      "4房2卫2车位的家庭型独立屋。",
      "530 平方米土地由用户确认。",
      "同街指导价证据支持 $1.3m 中段到 $1.4m 区间。",
      "产权文件、规划覆盖层和当前房况仍需确认。"
    ],
    comparables: [
      ["4 Moresby Street", "$1.35m-$1.40m", "Guide", "530 sqm", "4 / 3 / 2", "Strong"],
      ["1 Loreen Street", "$1.505m", "Feb 2026", "Unknown", "4 bed", "Good"],
      ["23 Olinda Grove", "$1.533m", "Feb 2026", "Unknown", "4 bed", "Good"]
    ],
    location: {
      rank: "Middle 50% to Top 25%, estimated",
      type: "Residential street",
      amenity: "Good",
      parking: "To be checked",
      rankZh: "中间 50% 到前 25%，估算",
      typeZh: "住宅街",
      amenityZh: "好",
      parkingZh: "待检查"
    },
    suburb: [
      "Oakleigh South has family-house demand and school access.",
      "Recent 4-bedroom sales support low-to-mid $1.5m ceiling.",
      "Condition and site layout remain important."
    ],
    suburbZh: [
      "Oakleigh South 有家庭型住房需求和学校便利性。",
      "近期 4 房成交支持低到中位 $1.5m 的价格上限。",
      "房况和地块布局仍然重要。"
    ],
    planning: {
      landSource: "User-confirmed, title still required",
      granny: "Low to Medium",
      approval: "Not approved",
      landSourceZh: "用户确认，仍需产权文件",
      grannyZh: "低到中等",
      approvalZh: "未获批准"
    },
    map: {
      target: "18",
      station: "Huntingdale Station",
      shops: "Clayton Road",
      stationZh: "Huntingdale 火车站",
      shopsZh: "Clayton Road 商圈"
    }
  },
  {
    aliases: [
      "unit2 11 mcintosh st oakleigh",
      "unit 2 11 mcintosh st oakleigh",
      "2/11 mcintosh st oakleigh",
      "2 11 mcintosh street oakleigh",
      "unit2 11 mcintosh street oakleigh"
    ],
    address: "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166",
    type: "Villa",
    value: "$790k - $870k",
    midpoint: "$830k",
    midpointValue: 830000,
    confidence: "Medium",
    status: "Medium",
    reasons: [
      "Villa/unit profile requires same-complex and same-street unit evidence, not house-only comparisons.",
      "Some older property records may reflect the original single dwelling; this estimate is based on the current Unit 2 / villa profile.",
      "Land component is partial and must be checked against title plan and plan of subdivision.",
      "Rear/front position, driveway access, courtyard usability and car parking materially affect value.",
      "Owners corporation and shared maintenance obligations need confirmation before PDF-grade confidence."
    ],
    reasonsZh: [
      "Villa / Unit 需要同项目和同街同类型成交作为核心依据，不能只用独立屋比较。",
      "部分旧物业记录可能仍显示原来的独立屋；本估值按当前 Unit 2 / Villa 形态处理。",
      "土地权益为部分土地，需要用产权图和 subdivision plan 复核。",
      "前后排位置、共用车道、庭院可用性和停车会显著影响价值。",
      "业主委员会和共用维护责任需要确认后，置信度才能提高。"
    ],
    comparables: [
      ["1/13 McIntosh Street", "$805k", "Mar 2026", "Strata", "2 / 1 / 1", "Strong"],
      ["2/9 McIntosh Street", "$840k", "Feb 2026", "Strata", "2 / 1 / 1", "Good"],
      ["3/15 Burlington Street", "$875k", "Apr 2026", "Strata", "2 / 1 / 1", "Good"]
    ],
    location: {
      rank: "Middle 50% to Top 25%, estimated",
      type: "Quiet mixed villa / house street",
      amenity: "Strong",
      parking: "Shared-driveway check required",
      rankZh: "中间 50% 到前 25%，估算",
      typeZh: "安静的别墅 / 独立屋混合街道",
      amenityZh: "强",
      parkingZh: "需要检查共用车道和停车"
    },
    suburb: [
      "Oakleigh villa demand is supported by downsizers, first-home buyers and investors seeking lower maintenance.",
      "Same-complex sales and same-street villa/unit sales should carry higher weight than detached house sales.",
      "Rental demand is supported by Oakleigh Station, Eaton Mall, Chadstone and Monash employment access."
    ],
    suburbZh: [
      "Oakleigh 的 Villa 需求来自 downsizer、首次置业者和偏好低维护的投资者。",
      "同项目和同街 Villa / Unit 成交权重应高于独立屋成交。",
      "Oakleigh Station、Eaton Mall、Chadstone 和 Monash 就业通勤支撑租赁需求。"
    ],
    planning: {
      landSource: "Strata / subdivision plan required",
      granny: "Owners corporation to confirm",
      approval: "Driveway, courtyard and car space check",
      landSourceZh: "需要 strata / subdivision plan 确认",
      grannyZh: "需要确认 Owners corporation",
      approvalZh: "检查车道、庭院和车位"
    },
    builtFormVerification: {
      status: "current-form-priority",
      summary: "Address pattern and current use point to Unit 2 / villa stock. Older single-dwelling records should be treated as historical background only.",
      summaryZh: "地址形态和当前用途指向 Unit 2 / Villa。旧的单一独立屋记录只作为历史背景。",
      currentForm: "Unit 2 / Villa",
      currentFormZh: "Unit 2 / Villa",
      legacyRisk: "Older portal or profile records may still show the original single dwelling.",
      legacyRiskZh: "部分旧门户或物业档案可能仍显示原来的单一独立屋。",
      action: "Use same-type villa/unit comparables, plan of subdivision, current photos and title evidence before relying on land or building assumptions.",
      actionZh: "估值应优先使用同类型 Villa/Unit 成交、subdivision plan、当前照片和产权证据，而不是旧独立屋假设。"
    },
    planningLabels: {
      en: ["Title / plan type", "Owners corporation", "Access / parking risk"],
      zh: ["产权 / 图纸类型", "业主委员会", "进出 / 停车风险"]
    },
    modelNotes: [
      "Townhouse/Villa model: comparable sales 60%-70%, title/strata structure 10%-15%, position/access/parking 10%-15%, condition and courtyard utility 5%-10%.",
      "Core extra fields: strata title, plan of subdivision, owners corporation fee, common driveway, front/rear position, courtyard, car space and body corporate obligations."
    ],
    modelNotesZh: [
      "Townhouse/Villa 模型：可比成交 60%-70%，产权/strata 结构 10%-15%，位置/进出/停车 10%-15%，房况和庭院实用性 5%-10%。",
      "新增核心字段：strata title、subdivision plan、owners corporation fee、共用车道、前后排位置、庭院、车位和共用维护责任。"
    ],
    map: {
      target: "2/11",
      station: "Oakleigh Station",
      shops: "Eaton Mall",
      stationZh: "Oakleigh 火车站",
      shopsZh: "Eaton Mall 商场"
    }
  },
  {
    aliases: [
      "unit1 5 mcintosh st oakleigh",
      "unit 1 5 mcintosh st oakleigh",
      "1/5 mcintosh st oakleigh",
      "1 5 mcintosh street oakleigh",
      "unit1 5 mcintosh street oakleigh"
    ],
    address: "Unit 1, 5 McIntosh Street, Oakleigh VIC 3166",
    type: "Townhouse",
    value: "$930k - $1.03m",
    midpoint: "$980k",
    midpointValue: 980000,
    confidence: "Medium",
    status: "Medium",
    reasons: [
      "Townhouse profile should be benchmarked against similar attached or semi-detached stock.",
      "Front position can support value if street frontage, private entry and parking are superior.",
      "Building area, courtyard size and title boundaries need confirmation.",
      "Owners corporation fees, defects and shared insurance can affect investor net return."
    ],
    reasonsZh: [
      "联排住宅应主要与类似联排或半独立物业比较。",
      "如果前排位置、独立入口和停车更好，价格可获得支撑。",
      "建筑面积、庭院大小和产权边界仍需确认。",
      "Owners corporation 费用、建筑缺陷和共用保险会影响投资净收益。"
    ],
    comparables: [
      ["2/9 McIntosh Street", "$965k", "Mar 2026", "Strata", "3 / 2 / 1", "Good"],
      ["1/21 Burlington Street", "$1.01m", "Apr 2026", "Strata", "3 / 2 / 2", "Strong"],
      ["3/17 Haughton Road", "$920k", "Feb 2026", "Strata", "2 / 2 / 1", "Medium"]
    ],
    location: {
      rank: "Top 25% to Middle 50%, estimated",
      type: "Quiet townhouse / villa pocket",
      amenity: "Strong",
      parking: "Front/rear position dependent",
      rankZh: "前 25% 到中间 50%，估算",
      typeZh: "安静的联排 / 别墅小区段",
      amenityZh: "强",
      parkingZh: "取决于前后排位置"
    },
    suburb: [
      "Oakleigh townhouses appeal to buyers priced below detached houses but wanting land feel and private entry.",
      "Same-type evidence should be separated from apartments and detached houses.",
      "Access to station, shops and employment nodes supports both owner-occupier and rental demand."
    ],
    suburbZh: [
      "Oakleigh 联排吸引买不起独立屋但希望有土地感和独立入口的买家。",
      "同类型成交应与公寓和独立屋分开。",
      "车站、商圈和就业节点支撑自住和出租需求。"
    ],
    planning: {
      landSource: "Title plan / lot entitlement required",
      granny: "Owners corporation fee required",
      approval: "Frontage, driveway and courtyard check",
      landSourceZh: "需要产权图 / lot entitlement",
      grannyZh: "需要 owners corporation fee",
      approvalZh: "检查临街、车道和庭院"
    },
    planningLabels: {
      en: ["Title / lot entitlement", "Owners corporation fee", "Frontage / courtyard"],
      zh: ["产权 / lot 权益", "业主委员会费用", "临街 / 庭院"]
    },
    modelNotes: [
      "Townhouse model separates attached dwelling value from detached-house land value.",
      "Key modifiers: street frontage, front/rear position, internal area, courtyard, garage/car space, body corporate and recent same-type sales."
    ],
    modelNotesZh: [
      "Townhouse 模型会把联排住宅价值和独立屋土地价值分开处理。",
      "关键修正项：临街面、前后排位置、室内面积、庭院、车库/车位、body corporate 和近期同类型成交。"
    ],
    map: {
      target: "1/5",
      station: "Oakleigh Station",
      shops: "Eaton Mall",
      stationZh: "Oakleigh 火车站",
      shopsZh: "Eaton Mall 商场"
    }
  },
  {
    aliases: [
      "apartment 12 20 haughton road oakleigh",
      "apt 12 20 haughton road oakleigh",
      "12/20 haughton road oakleigh",
      "12 20 haughton rd oakleigh",
      "unit 12 20 haughton road oakleigh"
    ],
    address: "Apartment 12, 20 Haughton Road, Oakleigh VIC 3166",
    type: "Apartment",
    value: "$540k - $610k",
    midpoint: "$575k",
    midpointValue: 575000,
    confidence: "Medium",
    status: "Medium",
    reasons: [
      "Apartment value is primarily benchmarked against same-building and same-project sales.",
      "Internal area, floor level, aspect, natural light, car space and storage are key price drivers.",
      "Owners corporation fees, building age, defects, cladding and sinking fund position need confirmation.",
      "Land component has limited direct weight compared with unit entitlement and building quality."
    ],
    reasonsZh: [
      "公寓估值主要以同楼和同项目成交为基准。",
      "室内面积、楼层、朝向、采光、车位和储物间是核心价格因素。",
      "业主委员会费用、楼龄、缺陷、外墙材料和维修基金状况需要确认。",
      "土地因素的直接权重较低，更看重 unit entitlement 和楼宇质量。"
    ],
    comparables: [
      ["8/20 Haughton Road", "$565k", "Mar 2026", "Apartment", "2 / 1 / 1", "Strong"],
      ["15/22 Haughton Road", "$598k", "Apr 2026", "Apartment", "2 / 2 / 1", "Good"],
      ["5/12 Dalgety Street", "$535k", "Feb 2026", "Apartment", "2 / 1 / 1", "Medium"]
    ],
    location: {
      rank: "Apartment pocket, station-oriented",
      type: "Retail / transport edge",
      amenity: "Very strong",
      parking: "Car space confirmation required",
      rankZh: "车站导向型公寓区段",
      typeZh: "商圈 / 交通边缘位置",
      amenityZh: "很强",
      parkingZh: "需要确认车位"
    },
    suburb: [
      "Oakleigh apartments are supported by station access, retail amenity and rental demand.",
      "Apartment buyers compare body corporate costs, building condition and floor-plan efficiency.",
      "Same-building evidence carries higher weight than suburb-wide house or townhouse evidence."
    ],
    suburbZh: [
      "Oakleigh 公寓受车站、零售便利和租赁需求支撑。",
      "公寓买家会比较 body corporate 成本、楼宇状况和户型效率。",
      "同楼成交权重高于区域内独立屋或联排成交。"
    ],
    planning: {
      landSource: "Strata plan and unit entitlement required",
      granny: "Owners corporation fee / sinking fund required",
      approval: "Cladding, defects and facilities check",
      landSourceZh: "需要 strata plan 和 unit entitlement",
      grannyZh: "需要 owners corporation fee / sinking fund",
      approvalZh: "检查外墙、缺陷和设施"
    },
    planningLabels: {
      en: ["Strata / entitlement", "Owners corporation", "Building risk"],
      zh: ["Strata / 权益", "业主委员会", "楼宇风险"]
    },
    modelNotes: [
      "Apartment model: same-building and same-project sales 60%-75%, internal area/floor/aspect 10%-15%, car space/storage 5%-10%, owners corporation and building risk 10%-15%.",
      "Core extra fields: floor level, aspect, internal area, balcony, car space, storage cage, building age, body corporate fees, cladding, defects and sinking fund."
    ],
    modelNotesZh: [
      "Apartment 模型：同楼和同项目成交 60%-75%，室内面积/楼层/朝向 10%-15%，车位/储物间 5%-10%，业主委员会和楼宇风险 10%-15%。",
      "新增核心字段：楼层、朝向、室内面积、阳台、车位、储物间、楼龄、body corporate fee、外墙、缺陷和维修基金。"
    ],
    map: {
      target: "12/20",
      station: "Oakleigh Station",
      shops: "Eaton Mall",
      stationZh: "Oakleigh 火车站",
      shopsZh: "Eaton Mall 商场"
    }
  },
  {
    aliases: [
      "vacant land 13 gadd st oakleigh",
      "land 13 gadd st oakleigh",
      "13 gadd st oakleigh",
      "13 gadd street oakleigh",
      "13 gadd street oakleigh land"
    ],
    address: "13 Gadd Street, Oakleigh VIC 3166",
    type: "Vacant land",
    value: "$1.02m - $1.18m",
    midpoint: "$1.10m",
    midpointValue: 1100000,
    confidence: "Low-Medium",
    status: "Low-Medium",
    reasons: [
      "Vacant land valuation focuses on land size, frontage, slope, services and planning feasibility.",
      "The demo treats this as a vacant/development-site scenario and requires title/council confirmation.",
      "Comparable evidence should use land-only sales or knockdown/rebuild sales with building value removed.",
      "Development feasibility depends on zoning, overlays, easements, covenants and nearby built form."
    ],
    reasonsZh: [
      "空地估值重点是土地面积、临街宽度、坡度、市政服务和规划可行性。",
      "该地址按空地 / 开发地块情景处理，必须由产权和 council 资料确认。",
      "可比证据应使用纯土地成交，或剔除建筑价值后的推倒重建成交。",
      "开发可行性取决于 zoning、overlay、地役权、covenant 和周边建成形态。"
    ],
    comparables: [
      ["7 Gadd Street", "$1.08m", "Mar 2026", "Land", "Vacant / site", "Good"],
      ["21 Hanover Street", "$1.16m", "Apr 2026", "Land", "Development site", "Medium"],
      ["34 Burlington Street", "$1.03m", "Feb 2026", "Land", "Knockdown", "Medium"]
    ],
    location: {
      rank: "Middle 50%, development dependent",
      type: "Residential land pocket",
      amenity: "Good",
      parking: "Not applicable, access width required",
      rankZh: "中间 50%，取决于开发潜力",
      typeZh: "住宅土地区段",
      amenityZh: "好",
      parkingZh: "不适用，需要确认车道宽度"
    },
    suburb: [
      "Oakleigh land demand is supported by scarcity, school/retail access and redevelopment interest.",
      "End-value feasibility should compare finished townhouse/villa values against land plus build cost.",
      "Planning constraints can quickly reduce land value if yield or access is limited."
    ],
    suburbZh: [
      "Oakleigh 土地需求受稀缺性、学校/零售便利和再开发兴趣支撑。",
      "可行性需要比较完工后的联排/Villa 价值与土地加建造成本。",
      "如果规划限制影响开发数量或进出，土地价值会明显下降。"
    ],
    planning: {
      landSource: "Title search and feature survey required",
      granny: "Zoning, overlays, easements and covenants",
      approval: "Feasibility and council pre-check required",
      landSourceZh: "需要产权查询和测量图",
      grannyZh: "Zoning、overlays、地役权和 covenants",
      approvalZh: "需要可行性和 council 预审"
    },
    planningLabels: {
      en: ["Land evidence", "Planning controls", "Development feasibility"],
      zh: ["土地证据", "规划限制", "开发可行性"]
    },
    modelNotes: [
      "Vacant land model: land-only comparables 55%-65%, planning controls 15%-20%, frontage/slope/services 10%-15%, end-value feasibility 10%-15%.",
      "Core extra fields: land size, frontage, depth, slope, services, easements, zoning, overlays, covenant, title restrictions and achievable end value."
    ],
    modelNotesZh: [
      "Vacant land 模型：纯土地可比成交 55%-65%，规划限制 15%-20%，临街/坡度/服务 10%-15%，完工价值可行性 10%-15%。",
      "新增核心字段：土地面积、临街宽度、深度、坡度、市政服务、地役权、zoning、overlays、covenant、产权限制和可实现完工价值。"
    ],
    map: {
      target: "13",
      station: "Oakleigh Station",
      shops: "Oakleigh Central",
      stationZh: "Oakleigh 火车站",
      shopsZh: "Oakleigh Central"
    }
  },
  {
    aliases: [
      "unit1 3 mcintosh st oakleigh",
      "unit 1 3 mcintosh st oakleigh",
      "1/3 mcintosh st oakleigh",
      "1 3 mcintosh street oakleigh",
      "unit 1 3 mcintosh st oaklrigh"
    ],
    address: "Unit 1, 3 McIntosh Street, Oakleigh VIC 3166",
    type: "Unit",
    value: "$720k - $810k",
    midpoint: "$765k",
    midpointValue: 765000,
    confidence: "Medium",
    status: "Medium",
    reasons: [
      "Australian 'unit' can mean villa-style, townhouse-style or apartment-style stock, so classification is the first step.",
      "This address is assessed as a single-level unit/villa-style dwelling rather than an apartment.",
      "Same-complex, same-street and same-layout unit sales should carry the highest weight.",
      "Private open space, car space, building age and owners corporation obligations remain key checks."
    ],
    reasonsZh: [
      "澳洲 Unit 可能是 Villa、联排或公寓，所以第一步必须先分类。",
      "该地址按单层 Unit / Villa 风格处理，而不是公寓。",
      "同项目、同街和同户型 Unit 成交应有最高权重。",
      "私人户外空间、车位、楼龄和 owners corporation 责任仍是关键检查。"
    ],
    comparables: [
      ["2/11 McIntosh Street", "$830k", "Model", "Strata", "2 / 1 / 1", "Good"],
      ["1/13 McIntosh Street", "$805k", "Mar 2026", "Strata", "2 / 1 / 1", "Strong"],
      ["4/19 Burlington Street", "$735k", "Feb 2026", "Strata", "2 / 1 / 1", "Medium"]
    ],
    location: {
      rank: "Middle 50% to Top 25%, estimated",
      type: "Quiet unit / villa pocket",
      amenity: "Strong",
      parking: "Car space and driveway check required",
      rankZh: "中间 50% 到前 25%，估算",
      typeZh: "安静 Unit / Villa 区段",
      amenityZh: "强",
      parkingZh: "需要确认车位和车道"
    },
    suburb: [
      "Oakleigh unit demand is supported by affordability below townhouses and detached houses.",
      "The model first classifies unit subtype, then applies villa/townhouse/apartment logic as appropriate.",
      "Rental demand and low-maintenance ownership support investor interest."
    ],
    suburbZh: [
      "Oakleigh Unit 需求受低于联排和独立屋的可负担性支撑。",
      "模型先分类 Unit 子类型，再套用 Villa / Townhouse / Apartment 的对应逻辑。",
      "租赁需求和低维护持有特点支撑投资者兴趣。"
    ],
    planning: {
      landSource: "Strata title and unit subtype required",
      granny: "Owners corporation / shared area check",
      approval: "Car space, courtyard and condition check",
      landSourceZh: "需要 strata title 和 Unit 子类型",
      grannyZh: "检查 owners corporation / 共用区域",
      approvalZh: "检查车位、庭院和房况"
    },
    planningLabels: {
      en: ["Unit subtype", "Shared obligations", "Private utility"],
      zh: ["Unit 子类型", "共用责任", "私人实用性"]
    },
    modelNotes: [
      "Unit model starts with subtype classification: villa-style, townhouse-style or apartment-style.",
      "Core extra fields: subtype, title plan, owners corporation, private open space, car space, common driveway, building area and condition."
    ],
    modelNotesZh: [
      "Unit 模型首先做子类型分类：Villa 风格、Townhouse 风格或 Apartment 风格。",
      "新增核心字段：子类型、产权图、owners corporation、私人户外空间、车位、共用车道、建筑面积和房况。"
    ],
    map: {
      target: "1/3",
      station: "Oakleigh Station",
      shops: "Eaton Mall",
      stationZh: "Oakleigh 火车站",
      shopsZh: "Eaton Mall 商场"
    }
  }
];

const emptyValuation = {
  aliases: [],
  address: "Enter an address to start",
  addressZh: "请输入地址开始",
  type: "House",
  value: "Pending",
  valueZh: "待输入",
  midpoint: "Pending",
  midpointZh: "待输入",
  midpointValue: NaN,
  confidence: "Pending",
  confidenceZh: "待输入",
  status: "Pending",
  statusZh: "待输入",
  reasons: [
    "Enter a Melbourne property address to generate a first-layer estimate.",
    "Register after the estimate to unlock comparable sales, micro-location and planning checks."
  ],
  reasonsZh: [
    "请输入墨尔本房产地址，生成第一层估值。",
    "估值后注册，即可解锁可比成交、微位置和规划检查。"
  ],
  comparables: [],
  location: {
    rank: "Pending",
    type: "Pending",
    amenity: "Pending",
    parking: "Pending",
    rankZh: "待输入",
    typeZh: "待输入",
    amenityZh: "待输入",
    parkingZh: "待输入"
  },
  suburb: ["Suburb fundamentals will appear after an address is entered."],
  suburbZh: ["输入地址后会显示区域基本面。"],
  planning: {
    landSource: "Pending",
    granny: "Pending",
    approval: "Pending",
    landSourceZh: "待输入",
    grannyZh: "待输入",
    approvalZh: "待输入"
  },
  map: {}
};

const commercialPendingValuation = {
  aliases: [],
  address: "Commercial valuation module coming soon",
  addressZh: "商业地产估值模块后续开放",
  type: "Commercial",
  value: "Coming soon",
  valueZh: "后续开放",
  midpoint: "Pending",
  midpointZh: "待开放",
  midpointValue: NaN,
  confidence: "Pending",
  confidenceZh: "待开放",
  status: "Pending",
  statusZh: "待开放",
  reasons: [
    "Commercial property needs a separate valuation model and is not priced with the residential framework.",
    "Future checks will include rental income, lease term, tenant covenant, outgoings, cap rate and vacancy risk.",
    "For early commercial enquiries, leave contact details and send lease documents or income information for manual review."
  ],
  reasonsZh: [
    "商业地产需要独立估值模型，不能用住宅模型直接估。",
    "后续检查会包括租金收入、租约期限、租客质量、outgoings、cap rate 和空置风险。",
    "如果现在有商业地产咨询，可以留下联系方式，并补充租约或收益资料做人工复核。"
  ],
  comparables: [],
  location: {
    rank: "Trade area to be assessed",
    type: "Commercial catchment",
    amenity: "Tenant and customer access pending",
    parking: "Loading / customer parking pending",
    rankZh: "商圈等级待评估",
    typeZh: "商业覆盖区域",
    amenityZh: "租客和客流便利性待评估",
    parkingZh: "装卸 / 客户停车待评估"
  },
  suburb: [
    "Commercial analysis will review trade area, foot traffic, tenant mix, vacancy, competing supply and business exposure.",
    "Income evidence and lease documents are more important than residential-style bedroom/land comparisons.",
    "A commercial module will be built separately after the residential workflow is stable."
  ],
  suburbZh: [
    "商业地产分析会评估商圈、客流、租户组合、空置率、竞争供应和经营风险。",
    "收益证据和租约文件比住宅的房间数/土地比较更重要。",
    "商业地产模块会在住宅估值流程稳定后单独开发。"
  ],
  planning: {
    landSource: "Lease and income schedule required",
    granny: "Cap rate / yield model pending",
    approval: "Zoning, use and tenancy risk pending",
    landSourceZh: "需要租约和收益表",
    grannyZh: "Cap rate / yield 模型待开发",
    approvalZh: "Zoning、用途和租约风险待评估"
  },
  planningLabels: {
    en: ["Income evidence", "Yield / cap rate", "Use / tenancy risk"],
    zh: ["收益证据", "收益率 / cap rate", "用途 / 租约风险"]
  },
  modelNotes: [
    "Commercial model will be separate from residential: income, lease quality and market yield will be the primary valuation anchors.",
    "Future core fields: net income, lease expiry, options, WALE, tenant covenant, outgoings, incentives, vacancy, zoning/use and comparable yields."
  ],
  modelNotesZh: [
    "Commercial 模型会独立于住宅模型：收益、租约质量和市场 yield 会是主要估值锚点。",
    "后续核心字段：净收益、租约到期、续租权、WALE、租户质量、outgoings、incentives、空置率、zoning/use 和可比 yield。"
  ],
  map: {
    target: "C",
    station: "Trade area",
    shops: "Tenant mix",
    stationZh: "商圈",
    shopsZh: "租户组合"
  }
};

let unlocked = false;
let currentValuation = emptyValuation;
let selectedLvr = 0.6;
let language = "en";
let activeInvestorTheme = null;
let uploadedEvidenceSummary = [];
const sentLeadNotificationKeys = new Set();

const marketSourceGroups = [
  {
    key: "realestate",
    name: "realestate.com.au",
    weight: 24,
    role: "Core sold/listing portal",
    roleZh: "核心成交 / 挂牌门户",
    url: ({ suburb, state, type }) => `https://www.realestate.com.au/sold/in-${encodeURIComponent(`${suburb} ${state}`)}/list-1?source=refinement&propertyTypes=${encodeURIComponent(type || "house")}`
  },
  {
    key: "domain",
    name: "Domain",
    weight: 22,
    role: "Core sold/listing portal",
    roleZh: "核心成交 / 挂牌门户",
    url: ({ suburb, state }) => `https://www.domain.com.au/sold-listings/${encodeURIComponent(`${suburb} ${state}`)}/`
  },
  {
    key: "agentResults",
    name: "Agent sold / auction results",
    weight: 14,
    role: "Local agency result confirmation",
    roleZh: "本地中介成交 / 拍卖结果确认",
    url: ({ address, suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${address} ${suburb} ${state} sold auction result agent`)}`
  },
  {
    key: "propertyComAu",
    name: "property.com.au",
    weight: 12,
    role: "Property profile and sold history",
    roleZh: "物业档案和成交历史",
    url: ({ address, suburb, state }) => `https://www.property.com.au/search?query=${encodeURIComponent(`${address} ${suburb} ${state}`)}`
  },
  {
    key: "avmProfile",
    name: "PropertyValue / OnTheHouse profile",
    weight: 8,
    role: "AVM/profile cross-check",
    roleZh: "AVM / 物业档案交叉比对",
    url: ({ address, suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${address} ${suburb} ${state} PropertyValue OnTheHouse`)}`,
  },
  {
    key: "viewHomely",
    name: "View / Homely portal evidence",
    weight: 6,
    role: "Secondary portal signal",
    roleZh: "第二层门户信号",
    url: ({ address, suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${address} ${suburb} ${state} View Homely sold`)}`,
  },
  {
    key: "rentalEvidence",
    name: "Rental portal evidence",
    weight: 6,
    role: "Rent and yield context",
    roleZh: "租金和收益率背景",
    url: ({ suburb, state, type }) => `https://www.realestate.com.au/rent/in-${encodeURIComponent(`${suburb} ${state}`)}/list-1?source=refinement&propertyTypes=${encodeURIComponent(type || "house")}`
  },
  {
    key: "localMarketReport",
    name: "Local market / suburb report",
    weight: 8,
    role: "Suburb trend context",
    roleZh: "区域走势背景",
    url: ({ suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${suburb} ${state} suburb property market report sold prices`)}`
  }
];

const byId = (id) => document.getElementById(id);

function getSelectedState() {
  return byId("property-state")?.value || "VIC";
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeSuburbName(value) {
  const compact = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (/^oakl[a-z]*south$/.test(compact) || compact === "oakleysouth") return "Oakleigh South";
  if (/^oakl[a-z]*$/.test(compact) || compact === "oakley") return "Oakleigh";
  return toTitleCase(
    String(value || "")
      .toLowerCase()
      .replace(/\boakley\b|\boaklrigh\b/g, "oakleigh")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function getEnteredSuburb() {
  return normalizeSuburbName(byId("suburb")?.value.trim() || "");
}

function buildEnteredAddress() {
  const streetAddress = byId("address").value.trim();
  const suburb = getEnteredSuburb();
  const state = getSelectedState();
  return [streetAddress, suburb, state].filter(Boolean).join(", ");
}

function suburbFromAddress(address) {
  const cleaned = String(address || "").replace(/\bVIC\b|\bNSW\b|\bQLD\b|\bWA\b|\bSA\b|\bTAS\b|\bACT\b|\bNT\b|\b\d{4}\b/gi, "");
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];
  const normalized = normalizeAddress(cleaned);
  const inlineSuburbMatch = normalized.match(
    /^(?:unit\s+\d+\s+)?(?:\d+\s*\/\s*)?\d+\s+.+?\s+(?:street|avenue|road|grove|drive|court|crescent|parade|place|lane)\s+(.+)$/
  );
  if (inlineSuburbMatch?.[1]) {
    return toTitleCase(inlineSuburbMatch[1]);
  }
  const words = cleaned.trim().split(/\s+/);
  return words.length > 1 ? words.slice(-2).join(" ") : "";
}

function stateFromAddress(address) {
  return String(address || "").match(/\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b/i)?.[1]?.toUpperCase() || getSelectedState();
}

function isAttachedOrStrataType(type) {
  return /townhouse|villa|unit|apartment/i.test(String(type || ""));
}

function hasUnitAddressPattern(address) {
  return /\bunit\b|\bapt\b|\bapartment\b|^\s*\d+\s*\/|,\s*\d+\s*\//i.test(String(address || ""));
}

function buildBuiltFormVerification(data = currentValuation) {
  if (data.builtFormVerification) return data.builtFormVerification;
  const currentForm = data.type || "Property";
  if (!isAttachedOrStrataType(currentForm) && !hasUnitAddressPattern(data.address)) {
    return {
      status: "standard",
      summary: "No current built-form conflict is indicated for this address.",
      summaryZh: "该地址未显示当前建筑形态冲突。",
      currentForm,
      currentFormZh: currentForm,
      legacyRisk: "No legacy single-dwelling conflict is flagged.",
      legacyRiskZh: "未标记旧独立屋记录冲突。",
      action: "Use the selected property type and recent same-type evidence.",
      actionZh: "按所选物业类型和近期同类型证据处理。"
    };
  }
  return {
    status: "current-form-priority",
    summary: `This property is being assessed as ${currentForm}. Older single-dwelling records should not be used as the valuation anchor.`,
    summaryZh: `该物业按 ${currentForm} 处理。旧的单一独立屋记录不应作为估值锚点。`,
    currentForm,
    currentFormZh: currentForm,
    legacyRisk: "Some public profiles may lag behind subdivision, redevelopment or new townhouse/unit completion.",
    legacyRiskZh: "部分公开物业档案可能滞后于 subdivision、重建或新建 townhouse/unit 完工状态。",
    action: "Prioritise current photos, title/plan of subdivision, owners corporation information and same-type comparable sales.",
    actionZh: "优先使用当前照片、产权/subdivision plan、业主委员会资料和同类型可比成交。"
  };
}

function normalizePropertyTypeForPortal(type) {
  const normalized = String(type || "house").toLowerCase();
  if (normalized.includes("apartment") || normalized.includes("unit")) return "unit-apartment";
  if (normalized.includes("townhouse")) return "townhouse";
  if (normalized.includes("villa")) return "villa";
  if (normalized.includes("land")) return "land";
  return "house";
}

function buildMarketCrosscheck(data = currentValuation) {
  const suburb = data.propertySuburb || suburbFromAddress(data.address) || getEnteredSuburb() || "Australia";
  const state = data.propertyState || stateFromAddress(data.address) || getSelectedState();
  const type = normalizePropertyTypeForPortal(data.type);
  const comparableCount = Array.isArray(data.comparables) ? data.comparables.length : 0;
  const pending = data.type === "Commercial" || data.confidence === "Pending";
  const context = { address: data.address, suburb, state, type };

  const sources = marketSourceGroups.map((source, index) => {
    const coreSource = index < 4;
    const status = pending
      ? "pending"
      : comparableCount >= 3 && coreSource
        ? "ready-to-verify"
        : "search-generated";
    const statusZh = pending
      ? "待开放"
      : comparableCount >= 3 && coreSource
        ? "可核对"
        : "已生成搜索";
    return {
      ...source,
      status,
      statusZh,
      url: source.url(context)
    };
  });

  const readyWeight = sources.reduce((sum, source) => {
    if (source.status === "ready-to-verify") return sum + source.weight;
    return sum;
  }, 0);
  const independentCount = sources.filter((source) => source.status !== "pending").length;
  const score = pending ? null : Math.min(100, readyWeight);
  const band = pending
    ? "Pending"
    : independentCount < 3
      ? "Low"
      : score >= 75
        ? "High"
        : score >= 60
          ? "Medium-High"
          : score >= 45
            ? "Medium"
            : "Low";
  const bandZh = {
    Pending: "待开放",
    Low: "低",
    Medium: "中",
    "Medium-High": "中高",
    High: "高"
  }[band] || band;

  return {
    score,
    band,
    bandZh,
    independentCount,
    sources,
    summary: pending
      ? "Commercial cross-check is a later module because income, lease and yield evidence need a separate model."
      : `Generated ${sources.length} public market checks for ${suburb} ${state}. Core portal evidence is weighted before lower-weight secondary sources.`,
    summaryZh: pending
      ? "商业地产 cross-check 会作为后续独立模块，因为收益、租约和 yield 需要单独模型。"
      : `已为 ${suburb} ${state} 生成 ${sources.length} 个公开市场来源检查。核心门户证据权重高于第二层来源。`
  };
}

function renderMarketCrosscheck(data = currentValuation) {
  const crosscheck = buildMarketCrosscheck(data);
  currentValuation.marketCrosscheck = crosscheck;
  const title = byId("market-crosscheck-title");
  const summary = byId("market-crosscheck-summary");
  const score = byId("market-crosscheck-score");
  const note = byId("market-crosscheck-note");
  const grid = byId("market-source-grid");
  if (!title || !summary || !score || !note || !grid) return;

  title.textContent = language === "zh" ? "市场来源交叉比对" : "Market source cross-check";
  summary.textContent = language === "zh" ? crosscheck.summaryZh : crosscheck.summary;
  score.textContent =
    crosscheck.score === null
      ? localizeValue(crosscheck.band)
      : `${crosscheck.score}/100 · ${localizeValue(crosscheck.band)}`;
  note.textContent = language === "zh"
    ? "公开门户数据属于第二层证据，需要和产权、council、政府规划资料交叉比对，不能直接当成权威来源。"
    : "Public portal data is secondary evidence and must be cross-checked against title, council and government records where available.";

  grid.innerHTML = "";
  crosscheck.sources.forEach((source) => {
    const card = document.createElement("article");
    card.className = "market-source-card";

    const name = document.createElement("strong");
    name.textContent = source.name;
    card.appendChild(name);

    const meta = document.createElement("span");
    meta.textContent = `${language === "zh" ? "权重" : "Weight"} ${source.weight} · ${language === "zh" ? source.roleZh : source.role}`;
    card.appendChild(meta);

    const status = document.createElement("span");
    status.textContent = `${language === "zh" ? "状态" : "Status"}: ${language === "zh" ? source.statusZh : source.status}`;
    card.appendChild(status);

    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = language === "zh" ? "打开公开检查链接" : "Open public check";
    card.appendChild(link);

    grid.appendChild(card);
  });
}

const uiText = {
  en: {
    toggle: "简体中文",
    selectors: {
      ".topbar .eyebrow": "Australia-wide intake",
      ".topbar h1": "AusHomeValue",
      'nav a[href="#valuation"]': "Valuation",
      'nav a[href="#comparables"]': "Comparables",
      'nav a[href="#location"]': "Location",
      'nav a[href="#loan"]': "Loan",
      'nav a[href="#uploads"]': "Uploads",
      'nav a[href="#investor"]': "Investor Hub",
      'nav a[href="#about"]': "About Us",
      'nav a[href="#contact"]': "Contact",
      ".search-copy .eyebrow": "Free first-layer estimate",
      ".search-copy h2": "Select state, suburb and address. Get a quick estimate. Leave details for the full report.",
      ".hero-note": "Preliminary estimate only. Based on public information, comparable market evidence and client-supplied material; not a formal valuation or financial advice.",
      '.search-box label[for="property-state"]': "Property location",
      '.search-box label[for="address"]': "Street address",
      "#start-valuation": "Get free estimate",
      ".mobile-value-card .eyebrow": "Estimated value",
      ".mobile-value-label": "Estimated value",
      ".mobile-midpoint-label": "Midpoint",
      ".mobile-confidence-label": "Confidence",
      "#mobile-report-cta": "Unlock full report details",
      ".lead-panel .eyebrow": "Full report",
      ".lead-panel h2": "Leave details to unlock",
      ".lead-panel > p:not(.eyebrow)": "Basic estimate is free. Register to view comparable adjustments, planning notes and report download options.",
      'label[for="lead-email"]': "Email",
      'label[for="lead-name"]': "Name",
      'label[for="lead-phone"]': "Phone optional",
      ".form-provider-note": "Submission details are securely stored for report delivery and customer follow-up. We may record an approximate visitor region, but do not display your full IP address.",
      ".consent span": "You may contact me about this property report.",
      "#unlock-report": "Register and unlock",
      ".side-panel .panel:nth-of-type(2) h2": "Check Status",
      ".summary-main .eyebrow": "First-layer desktop valuation",
      ".value-band div:nth-child(1) span": "Estimated value",
      ".value-band div:nth-child(2) span": "Midpoint",
      ".value-band div:nth-child(3) span": "Confidence",
      ".summary-card h3": "Why this estimate?",
      ".grid-two .metric-card:nth-child(1) span": "Fast starting point",
      ".grid-two .metric-card:nth-child(1) strong": "Address in, estimate out",
      ".grid-two .metric-card:nth-child(1) p": "Start with a quick estimate, then unlock the detailed report when you are ready.",
      ".grid-two .metric-card:nth-child(2) span": "Clear next steps",
      ".grid-two .metric-card:nth-child(2) strong": "Know what to check",
      ".grid-two .metric-card:nth-child(2) p": "The report highlights useful follow-up items such as title, planning and condition evidence.",
      ".loan-panel .eyebrow": "Loan / LVR scenario",
      ".loan-panel h2": "How much could be borrowed against this value?",
      ".loan-grid div:nth-child(1) span": "Selected LVR",
      ".loan-grid div:nth-child(2) span": "Indicative max loan",
      ".loan-grid div:nth-child(3) span": "Required equity before costs",
      ".loan-disclaimer": "Indicative only. This is not a loan approval, credit assessment or personal financial advice. Actual borrowing capacity depends on lender policy, income, expenses and full application assessment.",
      "#comparables h2": "Key Comparables",
      ".detail-trigger.ghost": "View adjustments",
      "#locked-strip strong": "Full comparable adjustments are locked.",
      "#locked-strip span": "Create a free account to view all sales evidence and adjustment notes.",
      ".location-grid .detail-panel:nth-child(1) h2": "Micro-location",
      ".fundamentals-grid .detail-panel:nth-child(1) h2": "Suburb Fundamentals",
      ".fundamentals-grid .detail-panel:nth-child(2) h2": "Planning & Potential",
      "#uploads .eyebrow": "Improve accuracy",
      "#uploads h2": "Upload missing evidence to revise the estimate.",
      "#uploads p:not(.eyebrow):not(.pdf-note)": "Title, Section 32, current photos and inspection notes can upgrade confidence and narrow the valuation range.",
      ".pdf-note": "PDF download requires phone number and contact consent.",
      "#upload-evidence": "Upload evidence",
      "#download-pdf": "Download PDF",
      "#evidence-review h3": "Evidence review applied",
      "#evidence-revision-note": "Estimate revised using uploaded evidence. Download the report to see the evidence summary.",
      "#investor .eyebrow": "Investor Hub",
      "#investor h2": "Explore property-backed investment themes.",
      "#investor p:not(.eyebrow)": "General information only. Specific private opportunities require investor profile, eligibility review and compliance approval.",
      "#investor-lock strong": "Investor Hub details are locked.",
      "#investor-lock span": "Register to view investor education, profile questions and gated opportunity workflow.",
      "#about .eyebrow": "About Us",
      "#about h2": "Property research, finance thinking and practical investor support.",
      "#about .about-copy p:nth-of-type(2)": "AusHomeValue was created to make property research, investment thinking and finance decisions clearer, more structured and more useful for everyday property owners, investors and advisers.",
      "#about .about-copy p:nth-of-type(3)": "Our perspective connects Australia and China, helping clients understand Australian property opportunities through both local market evidence and cross-border wealth management experience.",
      "#about .about-copy p:nth-of-type(4)": "The team is led by finance and property professionals with over 25 years of experience across banking, insurance, private equity, real estate funds, wealth management, risk control and asset allocation for institutional and high-net-worth clients.",
      "#about .about-card h3": "Professional background",
      "#about .about-card li:nth-child(1)": "Master's Degree in Accounting, Private Banker Certificate and intermediate accountant qualification.",
      "#about .about-card li:nth-child(2)": "Experience with CMB, SPDB, insurance companies and private equity fund management practices.",
      "#about .about-card li:nth-child(3)": "Specialised in customised financial products, real estate project investment and HNW asset allocation.",
      "#about .about-card li:nth-child(4)": "Track record includes work connected to approximately AUD 5 billion in assets under management.",
      "#contact .eyebrow": "Contact Us",
      "#contact h2": "Have a property, finance or investment question?",
      "#contact > div:first-child p:not(.eyebrow)": "Send the address and your question by email, or scan the QR code to connect with us. We can review the case and tell you what evidence is still missing.",
      "#contact .contact-email": "info@aushomevalue.com.au",
      "#contact .qr-card strong": "WeChat / QR code",
      "#contact .qr-card p": "Tap to enlarge, then long press the QR code to scan or save.",
      "#contact .qr-card .qr-open-link": "Open QR image",
      "#qr-modal .eyebrow": "WeChat QR code",
      "#qr-modal h2": "Long press the QR code to scan or save.",
      "#qr-modal .qr-open-link": "Open original image",
      "#qr-close": "Close",
      ".modal-content .eyebrow": "Full report locked",
      "#modal-register": "Register to unlock",
      "#modal-close": "Not now",
      ".modal-content p:not(.eyebrow)": "Register to unlock comparable adjustments, suburb fundamentals, micro-location evidence and planning checks. PDF download requires phone number and contact consent.",
      "#manual-data-modal .eyebrow": "Manual evidence",
      "#manual-data-modal h2": "Add extra property notes.",
      "#manual-data-modal p:not(.eyebrow)": "Add title, planning, condition, street, rental or inspection notes. These notes will be included in the evidence review and PDF report.",
      "#manual-data-save": "Apply notes",
      "#manual-data-close": "Cancel",
      "#report-guide .eyebrow": "Report unlocked",
      "#report-guide h3": "Your detail report is ready below.",
      "#report-guide > p:not(.eyebrow)": "Start with comparable sales, then check micro-location, suburb fundamentals and planning potential.",
      ".report-guide-links a:nth-child(1)": "Comparables",
      ".report-guide-links a:nth-child(2)": "Location",
      ".report-guide-links a:nth-child(3)": "PDF / evidence",
      "#report-guide-modal .eyebrow": "Report unlocked",
      "#report-guide-modal h2": "Your detailed report sections are ready.",
      "#report-guide-modal p:not(.eyebrow)": "On mobile, start with the comparable sales table, then micro-location, suburb fundamentals and planning potential.",
      "#guide-comparables": "View report details",
      "#guide-location": "View location checks",
      "#guide-close": "Stay here",
      "#pdf-requirements-modal .eyebrow": "PDF download requirement",
      "#pdf-requirements-modal h2": "Phone number and contact consent are required.",
      "#pdf-requirements-modal p:not(.eyebrow)": "Please add your phone number and tick the contact consent box before downloading the full report PDF.",
      "#pdf-fill-details": "Fill phone details",
      "#pdf-close": "Not now"
    }
  },
  zh: {
    toggle: "English",
    selectors: {
      ".topbar .eyebrow": "澳洲全国地址入口",
      ".topbar h1": "AusHomeValue",
      'nav a[href="#valuation"]': "估值",
      'nav a[href="#comparables"]': "可比成交",
      'nav a[href="#location"]': "位置",
      'nav a[href="#loan"]': "贷款",
      'nav a[href="#uploads"]': "上传",
      'nav a[href="#investor"]': "投资中心",
      'nav a[href="#about"]': "关于我们",
      'nav a[href="#contact"]': "联系",
      ".search-copy .eyebrow": "免费第一层估值",
      ".search-copy h2": "先选择州、区域和街道地址，再查看快速估值；留下资料后查看完整报告。",
      ".hero-note": "初步估值仅供参考。结果基于公开资料、可比市场证据和客户补充资料，不构成正式估值、贷款批准或个人金融建议。",
      '.search-box label[for="property-state"]': "房产所在地区",
      '.search-box label[for="address"]': "街道地址",
      "#start-valuation": "获取免费估值",
      ".mobile-value-card .eyebrow": "估值结果",
      ".mobile-value-label": "估值区间",
      ".mobile-midpoint-label": "估值中点",
      ".mobile-confidence-label": "置信度",
      "#mobile-report-cta": "解锁完整报告详情",
      ".lead-panel .eyebrow": "完整报告",
      ".lead-panel h2": "留下资料解锁",
      ".lead-panel > p:not(.eyebrow)": "基础估值免费。注册后可查看可比成交调整、规划说明和报告下载选项。",
      'label[for="lead-email"]': "邮箱",
      'label[for="lead-name"]': "姓名",
      'label[for="lead-phone"]': "电话 选填",
      ".form-provider-note": "提交资料将安全保存，用于发送报告和客户跟进。系统可能记录大致访问地区，但不会在后台显示你的完整 IP 地址。",
      ".consent span": "我同意你可以就这份房产报告联系我。",
      "#unlock-report": "注册并解锁",
      ".side-panel .panel:nth-of-type(2) h2": "检查状态",
      ".side-panel .panel:nth-of-type(3) h2": "手工上传",
      ".summary-main .eyebrow": "第一层桌面估值",
      ".value-band div:nth-child(1) span": "估值区间",
      ".value-band div:nth-child(2) span": "估值中点",
      ".value-band div:nth-child(3) span": "置信度",
      ".summary-card h3": "为什么是这个估值？",
      ".grid-two .metric-card:nth-child(1) span": "快速起点",
      ".grid-two .metric-card:nth-child(1) strong": "输入地址，获得估值",
      ".grid-two .metric-card:nth-child(1) p": "先获得一个快速估值，需要时再解锁详细报告。",
      ".grid-two .metric-card:nth-child(2) span": "清晰下一步",
      ".grid-two .metric-card:nth-child(2) strong": "知道还要检查什么",
      ".grid-two .metric-card:nth-child(2) p": "报告会提示产权、规划、房况等有助于进一步确认的资料。",
      ".loan-panel .eyebrow": "贷款 / LVR 情景",
      ".loan-panel h2": "按这个估值大概可以借多少？",
      ".loan-grid div:nth-child(1) span": "选择 LVR",
      ".loan-grid div:nth-child(2) span": "指示性最高贷款额",
      ".loan-grid div:nth-child(3) span": "不含费用所需自有资金",
      ".loan-disclaimer": "仅为指示性 LVR 情景，不是贷款批准、信贷评估或个人金融建议。实际借款能力取决于贷款机构政策、收入、支出、信用记录和完整申请评估。",
      "#comparables h2": "关键可比成交",
      ".detail-trigger.ghost": "查看调整项",
      "#locked-strip strong": "完整可比成交调整已锁定。",
      "#locked-strip span": "创建免费账户后可查看所有成交证据和调整说明。",
      ".location-grid .detail-panel:nth-child(1) h2": "微位置",
      ".fundamentals-grid .detail-panel:nth-child(1) h2": "区域基本面",
      ".fundamentals-grid .detail-panel:nth-child(2) h2": "规划与潜力",
      "#uploads .eyebrow": "提高准确度",
      "#uploads h2": "上传缺失资料以修正估值。",
      "#uploads p:not(.eyebrow):not(.pdf-note)": "产权文件、Section 32、当前照片和检查记录可以提升置信度并收窄估值区间。",
      ".pdf-note": "下载 PDF 需要填写电话并授权联系。",
      "#upload-evidence": "上传资料",
      "#download-pdf": "下载 PDF",
      "#evidence-review h3": "已应用资料复核",
      "#evidence-revision-note": "系统已根据上传资料修正估值。下载报告可查看资料复核摘要。",
      "#investor .eyebrow": "投资中心",
      "#investor h2": "探索地产支持型投资主题。",
      "#investor p:not(.eyebrow)": "仅提供一般信息。具体私募机会需要投资人画像、资格审核和合规批准。",
      "#investor-lock strong": "投资中心详情已锁定。",
      "#investor-lock span": "注册后可查看投资教育、投资人画像问题和机会访问流程。",
      "#about .eyebrow": "关于我们",
      "#about h2": "让房产研究、投资理财和金融判断更清楚、更结构、更有帮助。",
      "#about .about-copy p:nth-of-type(2)": "AusHomeValue 的目标，是把房产研究、投资思考和金融决策整理成更清晰、更结构化、更实用的流程，帮助业主、投资人和专业顾问更快看懂一个物业案例。",
      "#about .about-copy p:nth-of-type(3)": "我们的视角连接澳大利亚和中国两地，帮助客户结合澳洲本地市场证据和跨境财富管理经验，更清楚地理解澳洲房产机会。",
      "#about .about-copy p:nth-of-type(4)": "团队由具备金融和地产背景的专业人士带领，拥有超过 25 年银行、保险、私募股权、地产基金、财富管理、风险控制和高净值客户资产配置经验。",
      "#about .about-card h3": "专业背景",
      "#about .about-card li:nth-child(1)": "会计硕士，持有私人银行相关证书及中级会计师资质。",
      "#about .about-card li:nth-child(2)": "曾在招商银行、浦发银行、保险公司及私募基金管理相关实践中积累经验。",
      "#about .about-card li:nth-child(3)": "专长包括机构及高净值客户定制化金融产品、地产项目投资和资产配置。",
      "#about .about-card li:nth-child(4)": "过往工作涉及的资产管理规模约 50 亿澳元。",
      "#contact .eyebrow": "联系我们",
      "#contact h2": "有房产、贷款或投资问题？",
      "#contact > div:first-child p:not(.eyebrow)": "把地址和你的问题发到邮箱，或扫描二维码联系我们。我们可以先看这个案例，并告诉你还缺哪些资料。",
      "#contact .contact-email": "info@aushomevalue.com.au",
      "#contact .qr-card strong": "微信 / 二维码",
      "#contact .qr-card p": "点击放大后，长按二维码识别或保存。",
      "#contact .qr-card .qr-open-link": "打开二维码原图",
      "#qr-modal .eyebrow": "微信二维码",
      "#qr-modal h2": "长按二维码识别或保存。",
      "#qr-modal .qr-open-link": "打开原图",
      "#qr-close": "关闭",
      ".modal-content .eyebrow": "完整报告已锁定",
      "#modal-register": "注册解锁",
      "#modal-close": "暂不",
      ".modal-content p:not(.eyebrow)": "注册后可查看可比成交调整、区域基本面、微位置证据和规划检查。下载 PDF 需要填写电话并授权联系。",
      "#manual-data-modal .eyebrow": "手工资料",
      "#manual-data-modal h2": "补充物业资料。",
      "#manual-data-modal p:not(.eyebrow)": "可以填写产权、规划、房况、街道、租金或检查记录。这些内容会进入资料复核和 PDF 报告。",
      "#manual-data-save": "应用资料",
      "#manual-data-close": "取消",
      "#report-guide .eyebrow": "报告已解锁",
      "#report-guide h3": "详细报告已经在下面开放。",
      "#report-guide > p:not(.eyebrow)": "建议先看可比成交，再看微位置、区域基本面和规划潜力。",
      ".report-guide-links a:nth-child(1)": "可比成交",
      ".report-guide-links a:nth-child(2)": "位置分析",
      ".report-guide-links a:nth-child(3)": "PDF / 补充资料",
      "#report-guide-modal .eyebrow": "报告已解锁",
      "#report-guide-modal h2": "详细报告板块已经开放。",
      "#report-guide-modal p:not(.eyebrow)": "手机端建议先看可比成交表，再看微位置、区域基本面和规划潜力。",
      "#guide-comparables": "查看报告详情",
      "#guide-location": "查看位置检查",
      "#guide-close": "留在这里",
      "#pdf-requirements-modal .eyebrow": "PDF 下载要求",
      "#pdf-requirements-modal h2": "下载 PDF 需要填写电话并勾选联系授权。",
      "#pdf-requirements-modal p:not(.eyebrow)": "请先补充电话号码，并勾选同意联系，再下载完整报告 PDF。",
      "#pdf-fill-details": "去填写电话",
      "#pdf-close": "暂不"
    }
  }
};

const labelSets = {
  en: {
    checkItems: ["Portal cross-check", "Recent sales scan", "Suburb fundamentals", "Micro-location review", "Title confirmation", "Current condition"],
    tableHeaders: ["Address", "Sale", "Date", "Land", "Config", "Similarity"],
    factLabels: ["Street rank", "Street type", "Amenity access", "Parking pressure", "Land source", "Granny flat potential", "Approval certainty"],
    chips: ["House", "Vacant land", "Townhouse", "Villa", "Unit", "Apartment", "Commercial"],
    investorButtons: ["Private credit", "Development finance", "Income property"],
    investorDetail: {
      headings: ["Investor profile", "Gated access"],
      lists: [
        ["Investment purpose and preferred strategy", "Budget / intended allocation range", "Risk tolerance and investment horizon", "Wholesale or sophisticated investor status"],
        ["Registered users see education and market themes", "Profile completed users can request opportunity summaries", "Eligible investors may access IM / DD materials after review"]
      ]
    }
  },
  zh: {
    checkItems: ["门户数据交叉检查", "近期成交扫描", "区域基本面", "微位置检查", "产权确认", "当前房况"],
    tableHeaders: ["地址", "成交价", "日期", "土地", "房型", "相似度"],
    factLabels: ["街道排名", "街道类型", "便利性", "停车压力", "土地来源", "奶奶房潜力", "批准确定性"],
    chips: ["独立屋", "空地", "联排", "别墅", "单元房", "公寓", "商业地产"],
    investorButtons: ["地产私募债", "开发融资", "收益型地产"],
    investorDetail: {
      headings: ["投资人画像", "权限访问"],
      lists: [
        ["投资目的和偏好策略", "预算 / 计划配置金额", "风险偏好和投资期限", "Wholesale 或 Sophisticated investor 状态"],
        ["注册用户可看投资教育和市场主题", "完成画像后可申请机会摘要", "通过资格审核后可查看 IM / DD 材料"]
      ]
    }
  }
};

const investorThemes = {
  en: {
    privateCredit: {
      title: "Private credit",
      copy: "Property-backed private credit focuses on short-term lending secured by real estate. The first review usually looks at valuation buffer, LVR, borrower exit strategy and security position.",
      points: [
        "Indicative LVR, valuation range and downside buffer",
        "Security ranking, repayment source and loan term",
        "Borrower background, project status and documents still required"
      ],
      consult: "For a specific case, scan the QR code below or email info@aushomevalue.com.au."
    },
    developmentFinance: {
      title: "Development finance",
      copy: "Development finance is assessed through land value, planning status, build cost, presales or exit evidence, and the practical timing risk of the project.",
      points: [
        "Site value, planning pathway and approval uncertainty",
        "Build budget, contingency and delivery timeline",
        "Exit plan through sale, refinance or retained income"
      ],
      consult: "For a project review, scan the QR code below or email info@aushomevalue.com.au."
    },
    incomeProperty: {
      title: "Income property",
      copy: "Income property review connects valuation with rent, occupancy, yield, debt capacity and tenant quality, so the investor can compare return against risk.",
      points: [
        "Current rent, likely rent and vacancy risk",
        "Yield, operating costs and interest-rate sensitivity",
        "Tenant profile, lease terms and refinance options"
      ],
      consult: "For an income-property discussion, scan the QR code below or email info@aushomevalue.com.au."
    }
  },
  zh: {
    privateCredit: {
      title: "地产私募债",
      copy: "地产私募债主要看是否有房产作为抵押、估值安全边际、LVR、借款人的退出方式，以及抵押权顺位是否清楚。",
      points: ["指示性 LVR、估值区间和下行缓冲", "抵押顺位、还款来源和借款期限", "借款人背景、项目状态和仍需补充的文件"],
      consult: "具体项目可以扫描下方二维码咨询，或发邮件到 info@aushomevalue.com.au。"
    },
    developmentFinance: {
      title: "开发融资",
      copy: "开发融资会结合土地价值、规划状态、建筑成本、预售或退出证据，以及项目时间风险一起判断。",
      points: ["地块价值、规划路径和审批不确定性", "建筑预算、预备金和交付时间", "通过出售、再融资或持有出租退出"],
      consult: "开发项目可以扫描下方二维码咨询，或发邮件到 info@aushomevalue.com.au。"
    },
    incomeProperty: {
      title: "收益型地产",
      copy: "收益型地产会把估值和租金、空置率、收益率、贷款能力、租客质量连接起来，帮助投资人比较收益和风险。",
      points: ["当前租金、潜在租金和空置风险", "收益率、运营成本和利率敏感度", "租客情况、租约条款和再融资选项"],
      consult: "收益型地产可以扫描下方二维码咨询，或发邮件到 info@aushomevalue.com.au。"
    }
  }
};

const evidenceTypes = {
  section32: {
    label: "Section 32 / vendor statement",
    labelZh: "Section 32 / 售房声明",
    pattern: /section\s*32|vendor statement|s32|disclosure/i
  },
  title: {
    label: "Title and title plan",
    labelZh: "产权和产权图",
    pattern: /title|certificate of title|title plan|lot plan|plan of subdivision/i
  },
  planning: {
    label: "Planning / zoning / overlays",
    labelZh: "规划 / 分区 / 覆盖层",
    pattern: /planning|zoning|zone|overlay|council|neighbourhood residential|general residential/i
  },
  photos: {
    label: "Current photos / condition evidence",
    labelZh: "当前照片 / 房况证据",
    pattern: /photo|photos|image|facade|kitchen|bathroom|condition|renovated|jpg|jpeg|png|heic/i
  },
  street: {
    label: "Street, access and parking review",
    labelZh: "街道、进出和停车复核",
    pattern: /street|road|access|parking|traffic|quiet|wide|narrow|tree/i
  }
};

function normalizeAddress(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\boakley\b|\boaklrigh\b/g, "oakleigh")
    .replace(/\bu\s*(\d+)\b/g, "unit $1")
    .replace(/\bunit(\d+)\b/g, "unit $1")
    .replace(/\b(\d+)\s*-\s*(\d+)\b/g, "$1/$2")
    .replace(/\b(no|num|number|#)\s*(\d+)\b/g, "$2")
    .replace(/[,.-]/g, " ")
    .replace(/\bvic\b/g, "")
    .replace(/\b3\d{3}\b/g, "")
    .replace(/\bst\b/g, "street")
    .replace(/\bav\b|\bave\b/g, "avenue")
    .replace(/\brd\b/g, "road")
    .replace(/\bgr\b/g, "grove")
    .replace(/\s+/g, " ")
    .trim();
}

function getAddressSignature(value) {
  const normalized = normalizeAddress(value);
  const slashMatch = normalized.match(/\b(\d+)\s*\/\s*(\d+)\b/);
  const unitMatch = normalized.match(/\bunit\s+(\d+)\b/);
  const streetMatch = normalized.match(/\b(\d+)\s+([a-z]+(?:\s+[a-z]+)*)\s+(street|avenue|road|grove|drive|court|crescent|parade|place|lane)\b/);
  const streetNumber = slashMatch?.[2] || streetMatch?.[1] || "";
  const streetName = streetMatch ? `${streetMatch[2]} ${streetMatch[3]}` : "";
  const unitNumber = slashMatch?.[1] || unitMatch?.[1] || "";
  const unitWordStartsAddress = Boolean(normalized.match(/^unit\s+\d+\s+[a-z]+/));
  const ambiguousUnitAsStreetNumber = unitWordStartsAddress && unitNumber === streetNumber;
  const hasUnitSignal = /\bunit\b|\b\d+\s*\/\s*\d+\b|\bapartment\b|\bapt\b|\bflat\b/.test(normalized);

  return {
    normalized,
    unitNumber,
    streetNumber,
    streetName,
    hasUnitSignal,
    ambiguousUnitAsStreetNumber
  };
}

function getValuationMatchScore(item, inputSignature, selectedType = "") {
  const selectedTypeMatches = selectedType ? item.type === selectedType : true;
  if (selectedType && !selectedTypeMatches) return -1;
  const itemRequiresUnitSignal = isAttachedOrStrataType(item.type) || item.aliases.some((alias) => getAddressSignature(alias).hasUnitSignal);

  return item.aliases.reduce((bestScore, alias) => {
    const aliasSignature = getAddressSignature(alias);
    let score = -1;

    if (aliasSignature.normalized === inputSignature.normalized) {
      score = 100;
    } else if (
      aliasSignature.streetName &&
      inputSignature.streetName &&
      aliasSignature.streetName === inputSignature.streetName &&
      aliasSignature.streetNumber &&
      inputSignature.streetNumber &&
      aliasSignature.streetNumber === inputSignature.streetNumber
    ) {
      if (itemRequiresUnitSignal && !inputSignature.hasUnitSignal) return bestScore;
      score = 60;

      if (aliasSignature.unitNumber && inputSignature.unitNumber) {
        if (aliasSignature.unitNumber === inputSignature.unitNumber) {
          score += 30;
        } else if (!inputSignature.ambiguousUnitAsStreetNumber) {
          score = -1;
        }
      } else if (inputSignature.unitNumber && !aliasSignature.unitNumber && !inputSignature.ambiguousUnitAsStreetNumber) {
        score = -1;
      } else if (inputSignature.hasUnitSignal && item.type === "House") {
        score = -1;
      }
    }

    if (score >= 0 && selectedTypeMatches) score += 10;
    return Math.max(bestScore, score);
  }, -1);
}

function findValuation(address, selectedType = "") {
  const inputSignature = getAddressSignature(address);
  const matches = valuations
    .map((item) => ({
      item,
      score: getValuationMatchScore(item, inputSignature, selectedType)
    }))
    .filter((match) => match.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (!matches.length) return null;
  return matches[0].item;
}

function parseComparablePrice(value) {
  const matches = String(value || "").matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(m|k)?/gi);
  const amounts = [...matches].map((match) => {
    const number = Number(match[1]);
    const unit = match[2]?.toLowerCase();
    if (unit === "m") return number * 1000000;
    if (unit === "k") return number * 1000;
    return number;
  }).filter((amount) => Number.isFinite(amount) && amount > 0);
  if (!amounts.length) return null;
  return amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
}

function formatMoney(amount) {
  if (!Number.isFinite(amount)) return "Manual review";
  if (amount >= 1000000) {
    const value = amount / 1000000;
    return `$${value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, "")}m`;
  }
  return `$${Math.round(amount / 1000)}k`;
}

function buildComparableDrivenEstimate(comparables = [], confidence = "Low") {
  const prices = comparables.map((row) => parseComparablePrice(row[1])).filter(Boolean).sort((a, b) => a - b);
  if (!prices.length) {
    return {
      value: "Manual review required",
      midpoint: "Manual review",
      midpointValue: NaN
    };
  }
  const middle = Math.floor(prices.length / 2);
  const midpointValue = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const confidenceBuffer = confidence === "Low-Medium" ? 0.08 : confidence === "Medium" ? 0.06 : 0.12;
  const low = Math.min(prices[0], midpointValue * (1 - confidenceBuffer));
  const high = Math.max(prices[prices.length - 1], midpointValue * (1 + confidenceBuffer));
  return {
    value: `${formatMoney(low)} - ${formatMoney(high)}`,
    midpoint: formatMoney(midpointValue),
    midpointValue
  };
}

function applyComparableSalesModel(data, confidence = data.confidence || "Low") {
  return {
    ...data,
    ...buildComparableDrivenEstimate(data.comparables, confidence)
  };
}

function inferPropertyTypeFromAddress(address, directAddressMatch = null, selectedType = "") {
  if (directAddressMatch) return directAddressMatch.type;
  if (selectedType === "Commercial") return "Commercial";
  const normalized = normalizeAddress(address);
  const signature = getAddressSignature(address);

  if (/\b(vacant land|development site|land only|land)\b/.test(normalized)) return "Vacant land";
  if (/\b(shop|retail|office|warehouse|commercial|factory)\b/.test(normalized)) return "Commercial";
  if (/\b(apartment|apt|flat)\b/.test(normalized)) return "Apartment";

  if (signature.hasUnitSignal) {
    const sameComplexType = valuations
      .map((item) => {
        if (!isAttachedOrStrataType(item.type)) return null;
        const hasSameComplexAlias = item.aliases.some((alias) => {
          const aliasSignature = getAddressSignature(alias);
          return (
            aliasSignature.streetName === signature.streetName &&
            aliasSignature.streetNumber === signature.streetNumber
          );
        });
        if (!hasSameComplexAlias) return null;
        return item.type;
      })
      .filter(Boolean)[0];
    return sameComplexType || "Unit";
  }

  const sameStreetType = valuations
    .map((item) => {
      const hasSameStreetAlias = item.aliases.some((alias) => {
        const aliasSignature = getAddressSignature(alias);
        return aliasSignature.streetName === signature.streetName;
      });
      if (!hasSameStreetAlias) return null;
      return item.type;
    })
    .filter((type) => type && !isAttachedOrStrataType(type))[0];

  if (sameStreetType) return sameStreetType;
  if (selectedType && selectedType !== "House") return selectedType;
  return "House";
}

function createInferredSameComplexValuation(address, selectedType = "", selectedState = "", enteredSuburb = "") {
  const inputSignature = getAddressSignature(address);
  if (!inputSignature.hasUnitSignal || !inputSignature.streetName || !inputSignature.streetNumber) return null;
  const targetSuburb = (enteredSuburb || suburbFromAddress(address)).toLowerCase();

  const hasRelatedParentRecord = valuations.some((item) => {
    if (!item.relatedUnitNumbers?.includes(inputSignature.unitNumber)) return false;
    return item.aliases.some((alias) => {
      const aliasSignature = getAddressSignature(alias);
      return (
        aliasSignature.streetName === inputSignature.streetName &&
        aliasSignature.streetNumber === inputSignature.streetNumber
      );
    });
  });

  let candidates = valuations
    .map((item) => {
      if (!isAttachedOrStrataType(item.type)) return null;
      const hasSameComplexAlias = item.aliases.some((alias) => {
        const aliasSignature = getAddressSignature(alias);
        return (
          aliasSignature.streetName === inputSignature.streetName &&
          aliasSignature.streetNumber === inputSignature.streetNumber
        );
      });
      if (!hasSameComplexAlias) return null;
      return {
        item,
        score: item.type === selectedType ? 2 : 1,
        inferenceKind: "same-complex"
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length && hasRelatedParentRecord) {
    candidates = valuations
      .map((item) => {
        if (!isAttachedOrStrataType(item.type)) return null;
        const itemSuburb = suburbFromAddress(item.address).toLowerCase();
        if (targetSuburb && itemSuburb !== targetSuburb) return null;
        const hasSameStreetAlias = item.aliases.some((alias) => {
          const aliasSignature = getAddressSignature(alias);
          return aliasSignature.streetName === inputSignature.streetName;
        });
        if (!hasSameStreetAlias) return null;
        return {
          item,
          score: item.type === selectedType ? 2 : 1,
          inferenceKind: "related-parent-same-street"
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }

  if (!candidates.length) return null;

  const selectedCandidate = candidates[0];
  const base = selectedCandidate.item;
  const usesRelatedParentSameStreet = selectedCandidate.inferenceKind === "related-parent-same-street";
  const propertyType = selectedType || base.type;
  const confidence = usesRelatedParentSameStreet ? "Low" : "Low-Medium";
  const unitLabel = inputSignature.unitNumber ? `Unit ${inputSignature.unitNumber}` : propertyType;
  const streetLabel = `${inputSignature.streetNumber} ${inputSignature.streetName.replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  const inferredAddress = address || `${unitLabel}, ${streetLabel}`;

  return {
    ...base,
    ...buildComparableDrivenEstimate(base.comparables, confidence),
    address: inferredAddress,
    addressZh: inferredAddress,
    propertyState: selectedState || stateFromAddress(inferredAddress),
    propertySuburb: enteredSuburb || suburbFromAddress(inferredAddress),
    type: propertyType,
    confidence,
    status: confidence,
    reasons: usesRelatedParentSameStreet
      ? [
          `${unitLabel} at ${streetLabel} was recognised from a related parent-address note, but same-unit evidence has not been provided yet.`,
          `The estimate is calculated from same-street ${base.type.toLowerCase()} comparable prices as a rough intake guide, not as a same-complex or same-unit result.`,
          "Title, plan of subdivision, unit entitlement, current photos, owners corporation details and same-unit sales must be checked before relying on the final number.",
          ...base.reasons.slice(0, 2)
        ]
      : [
          `${unitLabel} at ${streetLabel} was recognised as an attached/strata address, but same-unit evidence has not been provided yet.`,
          `The estimate is calculated from same-complex or same-street ${base.type.toLowerCase()} comparable prices as an initial guide, not as a same-unit result.`,
          "Title plan, plan of subdivision, unit entitlement, current photos and car space position should be checked before relying on the final number.",
          ...base.reasons.slice(0, 2)
        ],
    reasonsZh: usesRelatedParentSameStreet
      ? [
          `系统从母门牌关联备注中识别出 ${streetLabel} 的 ${unitLabel}，但目前还没有同一 unit 的直接证据。`,
          `本估值根据同街 ${base.type} 可比成交价格计算粗略入口区间，不把它当成同项目或同 unit 结果。`,
          "最终使用前必须复核 title、subdivision plan、unit entitlement、当前照片、业主委员会资料和同 unit 成交。",
          ...base.reasonsZh.slice(0, 2)
        ]
      : [
          `系统已识别 ${streetLabel} 的 ${unitLabel} 为 attached / strata 地址，但目前还没有同一 unit 的直接证据。`,
          `本估值根据同项目或同街 ${base.type} 可比成交价格计算初步区间，不把它当成同 unit 结果。`,
          "最终使用前应复核产权图、subdivision plan、unit entitlement、当前照片和车位位置。",
          ...base.reasonsZh.slice(0, 2)
        ],
    builtFormVerification: {
      status: "same-complex-inferred",
      summary: usesRelatedParentSameStreet
        ? `${unitLabel} is treated as a related parent-address intake record. Same-unit evidence is required before upgrading confidence.`
        : `${unitLabel} is treated as a same-complex inferred record. Same-unit evidence is required before upgrading confidence.`,
      summaryZh: usesRelatedParentSameStreet
        ? `${unitLabel} 按母门牌关联入口记录处理。需要同 unit 证据后才能提高置信度。`
        : `${unitLabel} 按同项目推断记录处理。需要同 unit 证据后才能提高置信度。`,
      currentForm: `${unitLabel} / ${propertyType}`,
      currentFormZh: `${unitLabel} / ${propertyType}`,
      legacyRisk: "Portal records can mix the original dwelling, another unit in the same complex, or the parent street address.",
      legacyRiskZh: "公开网站记录可能混合原始独立屋、同项目其他 unit 或母门牌地址。",
      action: "Use the current unit title, plan of subdivision, owner corporation details, photos and same-unit sales if available.",
      actionZh: "优先使用当前 unit 的 title、subdivision plan、业主委员会资料、照片和同 unit 成交。"
    },
    map: {
      ...base.map,
      target: inputSignature.unitNumber ? `${inputSignature.unitNumber}/${inputSignature.streetNumber}` : inputSignature.streetNumber
    }
  };
}

function createInferredSameStreetValuation(address, selectedType = "", selectedState = "", enteredSuburb = "") {
  const inputSignature = getAddressSignature(address);
  if (inputSignature.hasUnitSignal || !inputSignature.streetName || !inputSignature.streetNumber) return null;
  const targetSuburb = (enteredSuburb || suburbFromAddress(address)).toLowerCase();

  const candidates = valuations
    .map((item) => {
      const itemSuburb = suburbFromAddress(item.address).toLowerCase();
      if (targetSuburb && itemSuburb !== targetSuburb) return null;
      const hasSameStreetAlias = item.aliases.some((alias) => {
        const aliasSignature = getAddressSignature(alias);
        return aliasSignature.streetName === inputSignature.streetName;
      });
      if (!hasSameStreetAlias) return null;
      return {
        item,
        score: item.type === selectedType ? 3 : isAttachedOrStrataType(item.type) === isAttachedOrStrataType(selectedType) ? 2 : 1
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;

  const base = candidates[0].item;
  const propertyType = selectedType || base.type;
  const streetLabel = `${inputSignature.streetNumber} ${inputSignature.streetName.replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  const inferredAddress = address || streetLabel;

  return {
    ...base,
    ...buildComparableDrivenEstimate(base.comparables, "Low"),
    address: inferredAddress,
    addressZh: inferredAddress,
    propertyState: selectedState || stateFromAddress(inferredAddress),
    propertySuburb: enteredSuburb || suburbFromAddress(inferredAddress),
    type: propertyType,
    confidence: "Low",
    status: "Low",
    reasons: [
      `${streetLabel} is on a recognised street, but same-address evidence has not been provided yet.`,
      `The estimate is calculated from same-street ${base.type.toLowerCase()} comparable prices as a rough intake guide, not as a same-address result.`,
      "Title, land size, building form, current condition, photos and recent same-address or same-type sales must be checked before relying on the final number.",
      ...base.reasons.slice(0, 2)
    ],
    reasonsZh: [
      `${streetLabel} 位于已识别街道，但目前还没有同地址直接证据。`,
      `本估值根据同街 ${base.type} 可比成交价格计算粗略入口区间，不把它当成同地址结果。`,
      "最终使用前必须复核 title、土地面积、建筑形态、当前房况、照片和近期同地址或同类型成交。",
      ...base.reasonsZh.slice(0, 2)
    ],
    builtFormVerification: {
      status: "same-street-inferred",
      summary: `${streetLabel} is treated as a same-street intake record. Same-address evidence is required before upgrading confidence.`,
      summaryZh: `${streetLabel} 按同街入口记录处理。需要同地址证据后才能提高置信度。`,
      currentForm: propertyType,
      currentFormZh: propertyType,
      legacyRisk: "Same-street evidence can differ materially by land size, dwelling form, condition and title structure.",
      legacyRiskZh: "同街证据会因土地面积、建筑形态、房况和产权结构不同而明显变化。",
      action: "Use current title, land details, photos, planning information and same-type sales for the final review.",
      actionZh: "最终复核应使用当前 title、土地资料、照片、规划信息和同类型成交。"
    },
    map: {
      ...base.map,
      target: inputSignature.streetNumber
    }
  };
}

function createInferredSuburbValuation(address, selectedType = "", selectedState = "", enteredSuburb = "") {
  const inferredAddress = String(address || "").trim();
  const targetSuburb = (enteredSuburb || suburbFromAddress(inferredAddress)).toLowerCase();
  if (!inferredAddress || !targetSuburb || selectedType === "Commercial") return null;

  const candidates = valuations
    .map((item) => {
      const itemSuburb = suburbFromAddress(item.address).toLowerCase();
      if (itemSuburb !== targetSuburb) return null;
      return {
        item,
        score: item.type === selectedType ? 3 : isAttachedOrStrataType(item.type) === isAttachedOrStrataType(selectedType) ? 2 : 1
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;

  const base = candidates[0].item;
  const propertyType = selectedType || base.type;
  const suburbLabel = enteredSuburb || suburbFromAddress(inferredAddress);

  return {
    ...base,
    ...buildComparableDrivenEstimate(base.comparables, "Low"),
    address: inferredAddress,
    addressZh: inferredAddress,
    propertyState: selectedState || stateFromAddress(inferredAddress),
    propertySuburb: suburbLabel,
    type: propertyType,
    confidence: "Low",
    status: "Low",
    reasons: [
      `${inferredAddress} does not yet have same-address or same-street evidence, so this is a suburb-level intake estimate.`,
      `The estimate uses ${suburbLabel} ${base.type.toLowerCase()} evidence as a broad first pass, not as an address-level match.`,
      "Current title, land size, dwelling form, condition, photos, planning controls and recent same-type sales are required before relying on the final number.",
      ...base.reasons.slice(0, 2)
    ],
    reasonsZh: [
      `${inferredAddress} 目前没有同地址或同街直接证据，因此这是区域级别的入口粗估。`,
      `本估值使用 ${suburbLabel} 的 ${base.type} 资料作为宽口径初步参考，不把它当成地址级匹配。`,
      "最终使用前必须复核当前 title、土地面积、建筑形态、房况、照片、规划限制和近期同类型成交。",
      ...base.reasonsZh.slice(0, 2)
    ],
    builtFormVerification: {
      status: "suburb-inferred",
      summary: `${inferredAddress} is treated as a suburb-level intake record. Address-level evidence is required before upgrading confidence.`,
      summaryZh: `${inferredAddress} 按区域级入口记录处理。需要地址级证据后才能提高置信度。`,
      currentForm: propertyType,
      currentFormZh: propertyType,
      legacyRisk: "Suburb-level evidence can differ materially from the subject address by street quality, land size, title, building form and condition.",
      legacyRiskZh: "区域级证据可能因街道质量、土地面积、产权、建筑形态和房况与目标地址明显不同。",
      action: "Use current title, property details, photos, planning information and recent same-type sales for the final review.",
      actionZh: "最终复核应使用当前 title、物业资料、照片、规划信息和近期同类型成交。"
    },
    map: {
      ...base.map,
      target: getAddressSignature(inferredAddress).streetNumber || "Subject"
    }
  };
}

function createUnavailableValuation(address, inferredType = "House", selectedState = "", enteredSuburb = "") {
  return {
    ...valuations[0],
    address: address || "Unknown address",
    propertyState: selectedState,
    propertySuburb: enteredSuburb,
    type: inferredType,
    value: "Manual review required",
    midpoint: "Manual review",
    midpointValue: NaN,
    confidence: "Low",
    status: "Low",
    reasons: [
      "The address could not be parsed into a usable residential valuation intake.",
      selectedState === "VIC"
        ? "A real deployment would call the valuation API, title data and comparable-sales sources."
        : `${selectedState} intake is ready, but valuation data for this state will be connected in a later release.`,
      "Please check the street number, street name, suburb and state, then try again."
    ],
    reasonsZh: [
      "该地址暂时无法解析成可用的住宅估值入口。",
      selectedState === "VIC"
        ? "真实部署时会调用估值 API、产权资料和可比成交数据源。"
        : `${selectedState} 的地址入口已经准备好，但该州估值数据会在后续版本接入。`,
      "请检查门牌号、街名、suburb 和州后再试。"
    ],
    comparables: [],
    location: {
      rank: "Unknown",
      type: "Unknown",
      amenity: "Unknown",
      parking: "Unknown",
      rankZh: "未知",
      typeZh: "未知",
      amenityZh: "未知",
      parkingZh: "未知"
    },
    suburb: ["No suburb fundamentals available for this intake."],
    suburbZh: ["该入口暂无区域基本面。"],
    planning: {
      landSource: "Unknown",
      granny: "Unknown",
      approval: "Not assessed",
      landSourceZh: "未知",
      grannyZh: "未知",
      approvalZh: "未评估"
    },
    map: {}
  };
}

function runAddressValuation(address, selectedType = "", selectedState = "", enteredSuburb = "") {
  const normalizedSuburb = normalizeSuburbName(enteredSuburb);
  const directAddressMatch = findValuation(address);
  const inferredType = inferPropertyTypeFromAddress(address, directAddressMatch, selectedType);

  if (inferredType === "Commercial") {
    return {
      ...commercialPendingValuation,
      address: address || commercialPendingValuation.address,
      addressZh: address || commercialPendingValuation.addressZh,
      propertyState: selectedState,
      propertySuburb: normalizedSuburb
    };
  }

  if (directAddressMatch) return applyComparableSalesModel(directAddressMatch, directAddressMatch.confidence);

  return (
    createInferredSameComplexValuation(address, inferredType, selectedState, normalizedSuburb) ||
    createInferredSameStreetValuation(address, inferredType, selectedState, normalizedSuburb) ||
    createInferredSuburbValuation(address, inferredType, selectedState, normalizedSuburb) ||
    createUnavailableValuation(address, inferredType, selectedState, normalizedSuburb)
  );
}

function setList(id, items) {
  const element = byId(id);
  element.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    element.appendChild(li);
  });
}

function getLocalizedArray(data, key) {
  return language === "zh" && data[`${key}Zh`] ? data[`${key}Zh`] : data[key];
}

function getLocalizedPlanning(data, key) {
  return language === "zh" && data.planning[`${key}Zh`] ? data.planning[`${key}Zh`] : data.planning[key];
}

function getLocalizedLocation(data, key) {
  return language === "zh" && data.location[`${key}Zh`] ? data.location[`${key}Zh`] : data.location[key];
}

function getLocalizedModelNotes(data) {
  return language === "zh" && data.modelNotesZh ? data.modelNotesZh : data.modelNotes || [];
}

function getPlanningLabels(data) {
  if (data.planningLabels?.[language]) return data.planningLabels[language];
  return labelSets[language].factLabels.slice(4, 7);
}

const dynamicText = {
  zh: {
    "Low": "低",
    "Low-Medium": "低至中等",
    "Medium": "中等",
    "Medium-High": "中高",
    "High": "高",
    "Good": "良好",
    "Strong": "强",
    "Unknown": "未知",
    "Not assessed": "未评估",
    "Manual review": "人工复核",
    "Manual review required": "需要人工复核",
    "Pending": "待输入"
  }
};

function localizeValue(value) {
  if (language !== "zh") return value;
  if (dynamicText.zh[value]) return dynamicText.zh[value];
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/.test(value)) {
    const [month, year] = value.split(" ");
    const monthNumber = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(month) + 1;
    return `${year}年${monthNumber}月`;
  }
  if (/^\d+ sqm$/.test(value)) return value.replace(" sqm", " 平方米");
  if (/^\d+ bed$/.test(value)) return value.replace(" bed", "房");
  if (value === "Guide") return "指导价";
  return value;
}

function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

function detectEvidenceTypes(fileName, content) {
  const haystack = `${fileName}\n${content}`.toLowerCase();
  return Object.entries(evidenceTypes)
    .filter(([, config]) => config.pattern.test(haystack))
    .map(([key]) => key);
}

function getEvidenceLabel(type) {
  const config = evidenceTypes[type];
  return language === "zh" ? config.labelZh : config.label;
}

function formatEvidenceRange(midpointValue, rangePercent) {
  if (!Number.isFinite(midpointValue)) {
    return { value: "Manual review", midpoint: "Manual review" };
  }
  const low = midpointValue * (1 - rangePercent);
  const high = midpointValue * (1 + rangePercent);
  return {
    value: `${formatMoney(low)} - ${formatMoney(high)}`,
    midpoint: formatMoney(midpointValue)
  };
}

function renderEvidenceReview(summary) {
  uploadedEvidenceSummary = summary || [];
  const panel = byId("evidence-review");
  if (!uploadedEvidenceSummary.length) {
    panel.classList.add("hidden");
    byId("evidence-review-list").innerHTML = "";
    return;
  }
  setList("evidence-review-list", uploadedEvidenceSummary);
  panel.classList.remove("hidden");
}

function buildEvidenceSummary(files, detectedTypes, adjustedMidpoint, rangePercent, lang = language) {
  const detectedLabels = detectedTypes.map((type) => {
    const config = evidenceTypes[type];
    return lang === "zh" ? config.labelZh : config.label;
  });
  const rangeLabel = `${Math.round(rangePercent * 100)}%`;
  if (lang === "zh") {
    return [
      `已读取 ${files.length} 个文件：${files.map((file) => file.name).join("、")}`,
      `识别资料：${detectedLabels.join("、") || "未识别，需要人工复核"}`,
      Number.isFinite(adjustedMidpoint)
        ? `估值中点修正为 ${formatMoney(adjustedMidpoint)}，展示区间收窄到约 ±${rangeLabel}。`
        : "当前估值需要人工复核，无法自动修正中点。",
      "这些资料会进入报告的 evidence review 部分。"
    ];
  }
  return [
    `Read ${files.length} file${files.length === 1 ? "" : "s"}: ${files.map((file) => file.name).join(", ")}`,
    `Recognised evidence: ${detectedLabels.join(", ") || "unclassified, manual review required"}`,
    Number.isFinite(adjustedMidpoint)
      ? `Revised midpoint to ${formatMoney(adjustedMidpoint)} and narrowed the visible range to about ±${rangeLabel}.`
      : "Current estimate requires manual review, so the midpoint was not automatically revised.",
    "These items will be included in the evidence review section of the report."
  ];
}

function applyEvidenceSources(sources, sourceLabel = "uploaded evidence") {
  if (!Number.isFinite(currentValuation.midpointValue)) {
    byId("upload-message").textContent =
      language === "zh"
        ? "请先输入地址并生成估值，再上传资料修正估值。"
        : "Please enter an address and generate an estimate before uploading evidence.";
    return;
  }

  if (!sources.length) return;
  const fileList = sources.map((source) => ({ name: source.name }));
  const fileTexts = sources.map((source) => source.text || "");
  const detectedTypes = [
    ...new Set(sources.flatMap((source) => detectEvidenceTypes(source.name, source.text)))
  ];
  const allText = fileTexts.join("\n").toLowerCase();
  const hasPositiveCondition = /renovated|good condition|well maintained|updated kitchen|updated bathroom|优良|翻新|维护良好/.test(allText);
  const hasQuietStreet = /quiet|wide street|street trees|low traffic|安静|宽|树|低车流/.test(allText);
  const hasPlanningConstraint = /heritage|flood|easement|single dwelling covenant|限制|地役权|洪水|heritage overlay/.test(allText);
  const completeness = detectedTypes.length;
  const adjustment =
    (hasPositiveCondition ? 0.008 : 0) +
    (hasQuietStreet ? 0.004 : 0) -
    (hasPlanningConstraint ? 0.006 : 0);
  const adjustedMidpoint = Math.round((currentValuation.midpointValue * (1 + adjustment)) / 1000) * 1000;
  const rangePercent = Math.max(0.04, 0.1 - completeness * 0.012);
  const revisedRange = formatEvidenceRange(adjustedMidpoint, rangePercent);
  const evidenceSummary = buildEvidenceSummary(fileList, detectedTypes, adjustedMidpoint, rangePercent, "en");
  const evidenceSummaryZh = buildEvidenceSummary(fileList, detectedTypes, adjustedMidpoint, rangePercent, "zh");

  const revisedValuation = {
    ...currentValuation,
    value: revisedRange.value,
    midpoint: revisedRange.midpoint,
    midpointValue: adjustedMidpoint,
    confidence: completeness >= 4 ? "High" : completeness >= 2 ? "Medium-High" : currentValuation.confidence,
    status: completeness >= 4 ? "High" : currentValuation.status,
    reasons: [...currentValuation.reasons, "Uploaded client evidence has been used to revise the range and confidence."],
    reasonsZh: [...currentValuation.reasonsZh, "已根据客户上传资料修正估值区间和置信度。"],
    evidenceSummary,
    evidenceSummaryZh
  };

  renderValuation(revisedValuation);
  renderEvidenceReview(evidenceSummary);
  byId("upload-message").textContent =
    language === "zh"
      ? `${fileList.length} 项资料已读取，估值已根据资料修正。`
      : `${fileList.length} ${sourceLabel} item${fileList.length === 1 ? "" : "s"} read. Estimate revised using evidence.`;
}

async function applyEvidenceFiles(files) {
  const fileList = Array.from(files);
  if (!fileList.length) return;
  const fileTexts = await Promise.all(fileList.map((file) => readFileText(file)));
  applyEvidenceSources(
    fileList.map((file, index) => ({ name: file.name, text: fileTexts[index] })),
    "uploaded"
  );
}

function applyManualDataNotes() {
  const notes = byId("manual-data-notes").value.trim();
  if (!notes) {
    byId("upload-message").textContent =
      language === "zh" ? "请先填写手工资料内容。" : "Please enter manual property notes first.";
    return;
  }
  byId("manual-data-modal").close();
  applyEvidenceSources([{ name: "manual-property-notes.txt", text: notes }], "manual");
  byId("manual-data-notes").value = "";
  scrollToSection("#uploads");
}

function addressSeed(address) {
  return [...address].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function renderMap(data) {
  const seed = addressSeed(data.address);
  const map = data.map || {};
  const target = byId("map-target");
  const station = byId("map-station");
  const shops = byId("map-shops");
  const houseNumber = data.address.match(/^\d+/)?.[0] || "?";

  target.textContent = map.target || houseNumber;
  station.textContent =
    (language === "zh" ? map.stationZh : map.station) || (language === "zh" ? "附近车站" : "Nearby station");
  shops.textContent = (language === "zh" ? map.shopsZh : map.shops) || (language === "zh" ? "附近商圈" : "Nearby shops");

  target.style.left = `${30 + (seed % 35)}%`;
  target.style.top = `${28 + (seed % 30)}%`;
  station.style.right = `${8 + (seed % 18)}%`;
  station.style.bottom = `${10 + (seed % 20)}%`;
  shops.style.left = `${8 + (seed % 20)}%`;
  shops.style.top = `${8 + (seed % 18)}%`;
}

function renderComparables(rows) {
  const body = byId("comparables-body");
  body.innerHTML = "";
  const visibleRows = unlocked ? rows : rows.slice(0, 2);
  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell, index) => {
      const td = document.createElement("td");
      if (index === 5) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = localizeValue(cell);
        td.appendChild(pill);
      } else {
        td.textContent = localizeValue(cell);
      }
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function renderValuation(data) {
  currentValuation = {
    ...data,
    propertyState: data.propertyState || stateFromAddress(data.address),
    propertySuburb: data.propertySuburb || suburbFromAddress(data.address)
  };
  currentValuation.builtFormVerification = buildBuiltFormVerification(currentValuation);
  data = currentValuation;
  const planningLabels = getPlanningLabels(data);
  byId("property-address").textContent = language === "zh" && data.addressZh ? data.addressZh : data.address;
  byId("estimated-value").textContent = localizeValue(data.value);
  byId("midpoint").textContent = localizeValue(data.midpoint);
  byId("confidence").textContent = localizeValue(data.confidence);
  byId("mobile-property-address").textContent = language === "zh" && data.addressZh ? data.addressZh : data.address;
  byId("mobile-estimated-value").textContent = localizeValue(data.value);
  byId("mobile-midpoint").textContent = localizeValue(data.midpoint);
  byId("mobile-confidence").textContent = localizeValue(data.confidence);
  byId("check-status").textContent = localizeValue(data.status);
  byId("street-rank").textContent = getLocalizedLocation(data, "rank");
  byId("street-type").textContent = getLocalizedLocation(data, "type");
  byId("amenity-access").textContent = getLocalizedLocation(data, "amenity");
  byId("parking-pressure").textContent = getLocalizedLocation(data, "parking");
  document.querySelectorAll(".fundamentals-grid .detail-panel:nth-child(2) dt").forEach((dt, index) => {
    dt.textContent = planningLabels[index] || dt.textContent;
  });
  byId("land-source").textContent = getLocalizedPlanning(data, "landSource");
  byId("granny-potential").textContent = getLocalizedPlanning(data, "granny");
  byId("approval-certainty").textContent = getLocalizedPlanning(data, "approval");
  setList("reasons", getLocalizedArray(data, "reasons"));
  setList("suburb-list", getLocalizedArray(data, "suburb"));
  renderComparables(data.comparables);
  renderMap(data);
  renderLoanScenario();
  renderMarketCrosscheck(data);
  renderLockState();
  renderEvidenceReview(language === "zh" && data.evidenceSummaryZh ? data.evidenceSummaryZh : data.evidenceSummary);
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.type === data.type);
  });
}

function setTexts(items) {
  Object.entries(items).forEach(([selector, text]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  });
}

function setCollectionText(selector, values) {
  document.querySelectorAll(selector).forEach((element, index) => {
    if (values[index]) element.textContent = values[index];
  });
}

function setInvestorDetail(labels) {
  document.querySelectorAll("#investor-detail h3").forEach((heading, index) => {
    heading.textContent = labels.headings[index] || heading.textContent;
  });
  document.querySelectorAll("#investor-detail article").forEach((article, articleIndex) => {
    article.querySelectorAll("li").forEach((li, liIndex) => {
      li.textContent = labels.lists[articleIndex]?.[liIndex] || li.textContent;
    });
  });
}

function applyLanguage() {
  const text = uiText[language];
  const labels = labelSets[language];
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.body.classList.toggle("zh-mode", language === "zh");
  byId("language-toggle").textContent = text.toggle;
  setTexts(text.selectors);
  setCollectionText(".checklist li", labels.checkItems);
  setCollectionText(".chip", labels.chips);
  setCollectionText("th", labels.tableHeaders);
  setCollectionText(".facts dt", labels.factLabels);
  setCollectionText(".theme-card", labels.investorButtons);
  setInvestorDetail(labels.investorDetail);
  byId("suburb").placeholder = language === "zh" ? "例如 Oakleigh" : "Oakleigh";
  byId("address").placeholder = language === "zh" ? "例如 Unit 2, 11 McIntosh Street" : "Unit 2, 11 McIntosh Street";
  byId("lead-email").placeholder = language === "zh" ? "you@example.com" : "you@example.com";
  byId("lead-name").placeholder = language === "zh" ? "你的姓名" : "Your name";
  byId("lead-phone").placeholder = language === "zh" ? "下载 PDF 时需要" : "For PDF download";
  byId("manual-data-notes").placeholder =
    language === "zh"
      ? "例如：产权确认土地面积，厨房翻新，街道安静较宽，没有明显地役权。"
      : "Example: title confirms land size, renovated kitchen, quiet wide street, no visible easement.";
  renderValuation(currentValuation);
  if (activeInvestorTheme) renderInvestorTheme(activeInvestorTheme);
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return localizeValue("Manual review");
  if (value >= 1000000) return `$${(value / 1000000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}m`;
  return `$${Math.round(value / 1000)}k`;
}

function renderLoanScenario() {
  const value = currentValuation.midpointValue;
  const maxLoan = value * selectedLvr;
  const equity = value - maxLoan;
  byId("selected-lvr").textContent = `${Math.round(selectedLvr * 100)}%`;
  byId("max-loan").textContent = formatMoney(maxLoan);
  byId("required-equity").textContent = formatMoney(equity);
  document.querySelectorAll(".lvr").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.lvr) === selectedLvr);
  });
}

function renderLockState() {
  const locked = !unlocked;
  byId("locked-strip").classList.toggle("hidden", !locked);
  byId("investor-lock").classList.toggle("hidden", !locked);
  byId("investor-detail").classList.toggle("hidden", locked);
  byId("report-guide").classList.toggle("hidden", locked);
  document.querySelectorAll(".detail-panel").forEach((panel) => {
    panel.classList.toggle("unlocked", !locked);
  });
}

function scrollToSection(selector) {
  const target = document.querySelector(selector);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showReportGuideModal() {
  const modal = byId("report-guide-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
}

function showPdfRequirementsModal() {
  const modal = byId("pdf-requirements-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
}

function renderInvestorTheme(themeKey) {
  const theme = investorThemes[language][themeKey];
  if (!theme) return;
  activeInvestorTheme = themeKey;
  byId("investor-theme-title").textContent = theme.title;
  byId("investor-theme-copy").textContent = theme.copy;
  setList("investor-theme-list", [...theme.points, theme.consult]);
  const listItems = byId("investor-theme-list").querySelectorAll("li");
  listItems[listItems.length - 1]?.classList.add("consult-line");
  byId("investor-theme-detail").classList.remove("hidden");
  document.querySelectorAll(".theme-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === themeKey);
  });
}

function leadNotificationKey(lead) {
  return `${lead.email.toLowerCase()}::${lead.address.toLowerCase()}::${lead.eventType}`;
}

function hasLeadNotificationBeenSent(lead) {
  const key = leadNotificationKey(lead);
  if (sentLeadNotificationKeys.has(key)) return true;
  try {
    return localStorage.getItem(`aushomevalue-notified::${key}`) === "1";
  } catch {
    return false;
  }
}

function markLeadNotificationSent(lead) {
  const key = leadNotificationKey(lead);
  sentLeadNotificationKeys.add(key);
  try {
    localStorage.setItem(`aushomevalue-notified::${key}`, "1");
  } catch {
    // Ignore localStorage failures; in-memory tracking still prevents repeats in the same session.
  }
}

function formatVisitorRegion(leadRecord = {}) {
  return [leadRecord.ip_city, leadRecord.ip_region, leadRecord.ip_country].filter(Boolean).join(", ") || "Unavailable";
}

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value) {
  return sanitizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapPdfLine(text, maxChars = 88) {
  const words = sanitizePdfText(text).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function addReportSection(lines, title, items = []) {
  lines.push({ text: title, size: 14, bold: true, gapBefore: 12, gapAfter: 4 });
  items.forEach((item) => {
    if (Array.isArray(item)) {
      const [label, value] = item;
      lines.push({ text: `${label}: ${value}`, size: 10.5 });
    } else {
      lines.push({ text: item, size: 10.5 });
    }
  });
}

function buildDetailedReportLines() {
  const evidence = currentValuation.evidenceSummary || uploadedEvidenceSummary;
  const builtForm = currentValuation.builtFormVerification || buildBuiltFormVerification(currentValuation);
  const generatedAt = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" });
  const recipientName = byId("lead-name").value.trim() || "Not supplied";
  const selectedPropertyType = document.querySelector(".chip.active")?.dataset.type || currentValuation.type;
  const loanValue = Number.isFinite(currentValuation.midpointValue)
    ? formatMoney(currentValuation.midpointValue * selectedLvr)
    : "Manual review";
  const equityValue = Number.isFinite(currentValuation.midpointValue)
    ? formatMoney(currentValuation.midpointValue * (1 - selectedLvr))
    : "Manual review";
  const comparableLines = currentValuation.comparables.length
    ? currentValuation.comparables.map((row) => `${row[0]} | Sale ${row[1]} | ${row[2]} | Land ${row[3]} | ${row[4]} | Similarity ${row[5]}`)
    : ["No comparable rows available for this demo case."];
  const welcomeName = recipientName === "Not supplied" ? "there" : recipientName;

  const investorThemeLines = Object.values(investorThemes.en).flatMap((theme) => [
    `${theme.title}: ${theme.copy}`,
    ...theme.points.map((point) => `- ${point}`),
    `- ${theme.consult}`
  ]);
  const lines = [
    { text: "AusHomeValue Property Valuation Report", size: 20, bold: true, gapAfter: 4 },
    { text: "A practical property note prepared from your website search, uploaded evidence and valuation model checks.", size: 10.5, gapAfter: 12 }
  ];

  addReportSection(lines, "Welcome", [
    `Dear ${welcomeName},`,
    "Thank you for visiting AusHomeValue and taking the time to explore this property with us. Our purpose is simple: to make property research, investment and finance feel clearer, more structured and more useful before you make a decision.",
    "A property is never just one number. It is a combination of recent sales evidence, street quality, land and title details, planning potential, local fundamentals, lending context and the information you can provide from the ground. This report brings those items together in one place so you can see what supports the estimate, what still needs checking and what may change the result.",
    "If anything in this report looks incomplete, unclear or different from what you know about the property, we welcome your feedback. Extra documents, photos, planning notes, agent feedback or local observations can all help us improve the analysis."
  ]);

  addReportSection(lines, "1. Executive valuation summary", [
    ["Generated at", `${generatedAt} Melbourne time`],
    ["Property address", currentValuation.address],
    ["State / territory", currentValuation.propertyState || "Not supplied"],
    ["Suburb", currentValuation.propertySuburb || "Not supplied"],
    ["Property type", selectedPropertyType],
    ["Estimated value range", currentValuation.value],
    ["Estimated midpoint", currentValuation.midpoint],
    ["Confidence", currentValuation.confidence],
    ["Selected LVR scenario", `${Math.round(selectedLvr * 100)}%`],
    ["Indicative maximum loan", loanValue],
    ["Required equity before costs", equityValue]
  ]);

  addReportSection(lines, "2. How to read this estimate", [
    "- Treat this report as a practical starting point for property research, not a formal valuation.",
    "- The estimate is easier to rely on when recent comparable sales, property condition, title information and planning context all point in the same direction.",
    "- Where information is missing or uncertain, the report highlights what should be checked next instead of overstating certainty.",
    "- Additional title documents, photos, floorplans, leases or inspection notes can help refine the review."
  ]);

  addReportSection(lines, "3. Valuation rationale", currentValuation.reasons.map((reason) => `- ${reason}`));
  addReportSection(
    lines,
    "4. Uploaded evidence review",
    evidence.length
      ? evidence.map((item) => `- ${item}`)
      : ["- No uploaded evidence has been applied. Title, Section 32, planning notes, current photos and street checks would improve confidence."]
  );

  addReportSection(lines, "5. Comparable sales and adjustment notes", [
    ...comparableLines.map((item) => `- ${item}`),
    "- Adjustment note: recent same-type sales are compared against land size, building profile, condition, street quality, location convenience and settlement recency.",
    "- If the subject property has stronger evidence than a comparable, the model may support an uplift. If title, planning or condition remains unclear, confidence is held back."
  ]);

  addReportSection(lines, "6. Current property form check", [
    ["Current form used", builtForm.currentForm],
    ["Important note", builtForm.summary],
    ["Older record risk", builtForm.legacyRisk],
    ["Recommended confirmation", builtForm.action]
  ]);

  addReportSection(lines, "7. Micro-location and street checks", [
    ["Street rank", currentValuation.location.rank],
    ["Street type", currentValuation.location.type],
    ["Amenity access", currentValuation.location.amenity],
    ["Parking pressure", currentValuation.location.parking],
    ["Street length / access logic", "Review access to connecting roads, turning direction, local traffic flow and whether the street feels like a quiet residential pocket or a through-road."],
    ["Street trees / presentation", "Tree canopy, frontage rhythm and neighbouring presentation are treated as qualitative micro-location signals."]
  ]);

  addReportSection(lines, "8. Suburb fundamentals", [
    ...currentValuation.suburb.map((item) => `- ${item}`),
    "- Suburb review considers household demand, access to employment, schools, transport, retail, medical and comparison suburbs.",
    "- ABS Census, QuickStats, DataPacks and SEIFA should be used for structured public suburb research, including income, employment, occupation, household mix, dwelling mix, owner/renter ratio and socio-economic indexes.",
    "- ABS data explains suburb fundamentals and demand quality; it should support, not replace, recent comparable sales as the price anchor."
  ]);

  const planningLabels = currentValuation.planningLabels?.en || ["Land source", "Granny flat potential", "Approval certainty"];
  addReportSection(lines, "9. Planning, title and property-specific potential", [
    [planningLabels[0], currentValuation.planning.landSource],
    [planningLabels[1], currentValuation.planning.granny],
    [planningLabels[2], currentValuation.planning.approval],
    ["Council planning check", "A production workflow should cross-check zoning, overlays, covenants, easements, neighbourhood character controls and nearby built form."],
    ["Neighbouring height / built form", "Nearby property height and development pattern can support or constrain planning potential assumptions."],
    ["Manual title requirement", "Title search and title plan remain authoritative where portal land size or property configuration is inconsistent."]
  ]);

  addReportSection(lines, "10. Loan / LVR scenario", [
    ["Selected LVR", `${Math.round(selectedLvr * 100)}%`],
    ["Indicative maximum loan", loanValue],
    ["Required equity before costs", equityValue],
    "This is not a loan approval or borrowing capacity assessment. Actual lending depends on lender policy, income, expenses, credit history and full application review."
  ]);

  addReportSection(lines, "11. Investor Hub themes", investorThemeLines);

  addReportSection(lines, "12. How to use this report", [
    "- Start with the executive valuation summary, then read the comparable sales and uploaded evidence review to understand what supports the range.",
    "- Treat the current property form, micro-location and planning sections as a checklist for what should be confirmed before making a decision.",
    "- If you have additional documents, photos, agent feedback, lease details or planning correspondence, send them through and the case can be reviewed again.",
    "- If you want to discuss lending, investment finance, private credit or next steps, contact AusHomeValue by WeChat QR code or email."
  ]);

  addReportSection(lines, "13. Missing checks and next actions", [
    "- Confirm title search, title plan and Section 32 with authoritative documents.",
    "- Review current property condition, renovation quality and visible defects.",
    "- Confirm planning overlays, easements, covenants and council constraints.",
    "- Use recent settled sales within the suburb and same property type to update the comparable anchor.",
    "- Contact AusHomeValue by WeChat QR code or email info@aushomevalue.com.au for a case review."
  ]);

  addReportSection(lines, "Conclusion", [
    "Thank you again for using AusHomeValue. We hope this report gives you a clearer starting point, not just a price range, but a map of the evidence behind it.",
    "If you have questions, corrections or extra information, please contact us. Property analysis improves when the public data, professional judgement and client-supplied evidence are brought together carefully.",
    "Contact email: info@aushomevalue.com.au",
    "WeChat / QR code: please scan the AusHomeValue WeChat QR code shown in the contact section or marketing material.",
    "For property, lending, investment finance or private credit questions, please send the address and any supporting material so we can review the case properly."
  ]);

  addReportSection(lines, "Important disclaimer", [
    "This prototype report is for demonstration and lead-capture workflow testing only.",
    "It is not a formal valuation, credit assessment, financial product advice or legal/planning advice.",
    "Any investment, lending or acquisition decision should be reviewed with appropriately licensed professionals."
  ]);

  return lines;
}

function createPdfDocument(lineItems) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 48;
  const marginTop = 58;
  const marginBottom = 52;
  const contentWidthChars = 92;
  const pages = [];
  let page = [];
  let y = marginTop;

  function newPage() {
    if (page.length) pages.push(page);
    page = [];
    y = marginTop;
  }

  lineItems.forEach((item) => {
    const size = item.size || 10.5;
    const lineHeight = size + 4;
    const gapBefore = item.gapBefore || 0;
    const gapAfter = item.gapAfter || 0;
    const wrapped = wrapPdfLine(item.text, item.size >= 14 ? 62 : contentWidthChars);
    const needed = gapBefore + wrapped.length * lineHeight + gapAfter;
    if (y + needed > pageHeight - marginBottom) newPage();
    y += gapBefore;
    wrapped.forEach((text) => {
      page.push({ text, x: marginX, y, size, bold: item.bold });
      y += lineHeight;
    });
    y += gapAfter;
  });
  if (page.length) pages.push(page);

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageRefs = [];

  pages.forEach((items, pageIndex) => {
    const commands = [
      "BT",
      `/F2 9 Tf 48 ${pageHeight - 34} Td (${escapePdfText("AusHomeValue | Property Valuation Report")}) Tj`,
      `/F1 8 Tf 410 ${pageHeight - 34} Td (${escapePdfText(`Page ${pageIndex + 1} of ${pages.length}`)}) Tj`,
      "ET"
    ];
    items.forEach((item) => {
      commands.push("BT");
      commands.push(`/${item.bold ? "F2" : "F1"} ${item.size} Tf`);
      commands.push(`${item.x} ${pageHeight - item.y} Td`);
      commands.push(`(${escapePdfText(item.text)}) Tj`);
      commands.push("ET");
    });
    commands.push("BT");
    commands.push(`/F1 8 Tf 48 28 Td (${escapePdfText("Generated by AusHomeValue demo. Not a formal valuation.")}) Tj`);
    commands.push("ET");
    const stream = commands.join("\n");
    const contentRef = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageRef = addObject(`<< /Type /Page /Parent __PAGES__ /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRef} 0 R >>`);
    pageRefs.push(pageRef);
  });

  const pagesRef = addObject(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
  const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  pageRefs.forEach((ref) => {
    objects[ref - 1] = objects[ref - 1].replace("__PAGES__", `${pagesRef} 0 R`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

async function sendLeadNotification(lead) {
  const response = await fetch("https://formsubmit.co/ajax/info@aushomevalue.com.au", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      _subject: `New AusHomeValue lead: ${lead.address}`,
      _template: "table",
      name: lead.name,
      email: lead.email,
      phone: lead.phone || "Not supplied",
      property_address: lead.address,
      property_suburb: lead.suburb || "Not supplied",
      property_state: lead.propertyState || "Not supplied",
      estimated_value: lead.value,
      confidence: lead.confidence,
      activity: lead.eventType === "pdf_download" ? "PDF download" : "Report unlock",
      visitor_region: lead.visitorRegion || "Unavailable",
      lead_score: lead.leadScore || "Pending",
      priority: lead.priority || "Pending",
      contact_consent: lead.consent ? "Yes" : "No",
      pdf_download: lead.pdfDownload ? "Yes" : "No",
      submitted_at: lead.createdAt
    })
  });

  if (!response.ok) throw new Error("Lead notification failed");
}

async function saveLeadToDatabase(lead) {
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      contactConsent: lead.consent,
      pdfDownload: lead.pdfDownload,
      propertyAddress: lead.address,
      propertySuburb: lead.suburb,
      propertyState: lead.propertyState,
      propertyType: lead.propertyType,
      estimatedValue: lead.value,
      midpointValue: lead.midpointValue,
      confidence: lead.confidence,
      selectedLvr: lead.selectedLvr,
      language: lead.language,
      eventType: lead.eventType,
      analysis: lead.analysis
    })
  });

  if (!response.ok) throw new Error("Lead database save failed");
  return response.json();
}

async function saveLead({ pdfDownload = false } = {}) {
  const email = byId("lead-email").value.trim();
  const name = byId("lead-name").value.trim();
  const phone = byId("lead-phone").value.trim();
  const consent = byId("lead-consent").checked;
  const message = byId("lead-message");

  if (!email || !name) {
    message.textContent =
      language === "zh" ? "解锁完整报告需要填写邮箱和姓名。" : "Email and name are required to unlock the full report.";
    return false;
  }

  if (pdfDownload && (!phone || !consent)) {
    message.textContent =
      language === "zh"
        ? "下载 PDF 前需要填写电话并勾选联系授权。"
        : "Phone number and contact consent are required before PDF download.";
    return false;
  }

  const lead = {
    email,
    name,
    phone,
    consent,
    pdfDownload,
    address: currentValuation.address,
    suburb: currentValuation.propertySuburb || getEnteredSuburb(),
    propertyState: currentValuation.propertyState || getSelectedState(),
    value: currentValuation.value,
    midpointValue: currentValuation.midpointValue,
    confidence: currentValuation.confidence,
    propertyType: document.querySelector(".chip.active")?.dataset.type || currentValuation.type,
    selectedLvr: Math.round(selectedLvr * 100),
    language,
    eventType: pdfDownload ? "pdf_download" : "report_unlock",
    analysis: {
      reasons: currentValuation.reasons,
      comparables: currentValuation.comparables,
      location: currentValuation.location,
      suburb: currentValuation.suburb,
      propertySuburb: currentValuation.propertySuburb || getEnteredSuburb(),
      propertyState: currentValuation.propertyState || getSelectedState(),
      planning: currentValuation.planning,
      builtFormVerification: currentValuation.builtFormVerification || buildBuiltFormVerification(currentValuation),
      evidenceSummary: currentValuation.evidenceSummary || uploadedEvidenceSummary
    },
    createdAt: new Date().toISOString()
  };

  let stored = false;
  let notified = false;
  let savedLead = null;
  try {
    const databaseResult = await saveLeadToDatabase(lead);
    savedLead = databaseResult.lead || null;
    lead.visitorRegion = formatVisitorRegion(savedLead);
    lead.leadScore = savedLead?.lead_score;
    lead.priority = savedLead?.priority;
    lead.shouldSendNotification = databaseResult.notification?.should_send !== false;
    stored = true;
  } catch (error) {
    console.error(error);
  }

  try {
    if (stored && lead.shouldSendNotification && !hasLeadNotificationBeenSent(lead)) {
      await sendLeadNotification(lead);
      markLeadNotificationSent(lead);
      notified = true;
    }
  } catch (error) {
    console.error(error);
  }

  message.textContent = stored
    ? pdfDownload
      ? language === "zh"
        ? "PDF 信息已记录，客户资料已保存。"
        : "PDF details captured. Customer record saved."
      : language === "zh"
        ? "完整报告已解锁，客户资料已保存。"
        : "Full report unlocked. Customer record saved."
    : language === "zh"
      ? "暂时无法保存客户资料，请稍后再试。"
      : "Customer details could not be saved. Please try again later.";

  if (stored && lead.shouldSendNotification && !notified && !hasLeadNotificationBeenSent(lead)) {
    console.warn("Customer record saved, but lead notification email failed.");
  }
  return stored;
}

async function downloadDemoReport() {
  const phone = byId("lead-phone").value.trim();
  const consent = byId("lead-consent").checked;
  if (!phone || !consent) {
    const message = byId("lead-message");
    message.textContent =
      language === "zh"
        ? "下载 PDF 前需要填写电话并勾选联系授权。"
        : "Phone number and contact consent are required before PDF download.";
    showPdfRequirementsModal();
    return;
  }
  if (!(await saveLead({ pdfDownload: true }))) return;
  const blob = createPdfDocument(buildDetailedReportLines());
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aushomevalue-property-valuation-report.pdf";
  link.click();
  URL.revokeObjectURL(url);
}

byId("start-valuation").addEventListener("click", () => {
  const selectedType = document.querySelector(".chip.active")?.dataset.type || "House";
  const enteredAddress = buildEnteredAddress();
  const selectedState = getSelectedState();
  const enteredSuburb = getEnteredSuburb();
  renderValuation(runAddressValuation(enteredAddress || byId("address").value, selectedType, selectedState, enteredSuburb));
  if (window.matchMedia("(max-width: 680px)").matches) scrollToSection(".mobile-value-card");
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
  });
});

document.querySelectorAll(".lvr").forEach((button) => {
  button.addEventListener("click", () => {
    selectedLvr = Number(button.dataset.lvr);
    renderLoanScenario();
  });
});

byId("language-toggle").addEventListener("click", () => {
  language = language === "en" ? "zh" : "en";
  applyLanguage();
});

byId("unlock-report").addEventListener("click", async () => {
  if (!(await saveLead())) return;
  unlocked = true;
  renderLockState();
  renderComparables(currentValuation.comparables);
  showReportGuideModal();
});

byId("mobile-report-cta").addEventListener("click", () => {
  if (unlocked) {
    scrollToSection("#comparables");
    return;
  }
  scrollToSection(".lead-panel");
  byId("lead-email").focus({ preventScroll: true });
});

byId("upload-evidence").addEventListener("click", () => {
  byId("evidence-files").click();
});

byId("evidence-files").addEventListener("change", async (event) => {
  await applyEvidenceFiles(event.target.files);
});

byId("download-pdf").addEventListener("click", downloadDemoReport);

byId("enter-manual-data").addEventListener("click", () => {
  const modal = byId("manual-data-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
  byId("manual-data-notes").focus();
});

byId("manual-data-save").addEventListener("click", applyManualDataNotes);

byId("manual-data-close").addEventListener("click", () => {
  byId("manual-data-modal").close();
});

document.querySelectorAll(".theme-card").forEach((button) => {
  button.addEventListener("click", () => {
    if (!unlocked) return;
    renderInvestorTheme(button.dataset.theme);
  });
});

document.querySelectorAll(".detail-panel, .detail-trigger").forEach((element) => {
  element.addEventListener("click", () => {
    if (unlocked) return;
    const detail = element.dataset.detail || "full report detail";
    byId("unlock-title").textContent =
      language === "zh" ? "注册后可查看该详细内容。" : `Register to view ${detail}.`;
    byId("unlock-modal").showModal();
  });
});

byId("modal-close").addEventListener("click", () => {
  byId("unlock-modal").close();
});

byId("modal-register").addEventListener("click", () => {
  byId("unlock-modal").close();
  byId("lead-email").focus();
  document.querySelector(".lead-panel").scrollIntoView({ behavior: "smooth", block: "start" });
});

byId("guide-comparables").addEventListener("click", () => {
  byId("report-guide-modal").close();
  scrollToSection("#comparables");
});

byId("guide-location").addEventListener("click", () => {
  byId("report-guide-modal").close();
  scrollToSection("#location");
});

byId("guide-close").addEventListener("click", () => {
  byId("report-guide-modal").close();
});

byId("pdf-fill-details").addEventListener("click", () => {
  byId("pdf-requirements-modal").close();
  scrollToSection(".lead-panel");
  byId("lead-phone").focus({ preventScroll: true });
});

byId("pdf-close").addEventListener("click", () => {
  byId("pdf-requirements-modal").close();
});

byId("open-qr-modal").addEventListener("click", () => {
  const modal = byId("qr-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
});

byId("qr-close").addEventListener("click", () => {
  byId("qr-modal").close();
});

applyLanguage();
