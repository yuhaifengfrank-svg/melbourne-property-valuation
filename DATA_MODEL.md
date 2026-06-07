# 数据结构设计

## 1. 设计目标

本数据结构服务于 Metropolitan Melbourne House MVP 估值系统。

目标:

- 支持用户输入地址后生成第一层桌面估值
- 支持 recent comparable sales baseline
- 支持 micro-location / street ranking 分析
- 支持 condition、planning/title、risk 调整
- 支持 confidence scoring
- 支持 back-testing 和模型版本管理

第一版先采用逻辑数据模型，不绑定具体数据库。后续可以落地到 PostgreSQL、PostGIS、文档数据库或混合架构。

## 2. 核心实体

```text
Property
├── Address
├── SuburbProfile
├── LandProfile
├── BuildingProfile
├── PlanningProfile
├── RentalProfile
├── LoanScenario
├── MicroLocationProfile
├── SecondaryDwellingProfile
├── TownhouseProfile
├── VillaProfile
├── VacantLandProfile
├── ApartmentProfile
├── BodyCorporateProfile
├── DueDiligenceCheck
│
ValuationRun
├── ValuationResult
├── ComparableSelection
├── AdjustmentBreakdown
├── ConfidenceScore
│
Lead
├── ContactConsent
├── InvestorProfile
├── OpportunityAccessLog
│
InvestmentOpportunity
│
ComparableSale
│
BacktestRun
├── BacktestSample
└── BacktestMetrics
│
ModelVersion
```

## 3. Property

代表一个被评估房产。

### 3.1 字段

```json
{
  "property_id": "prop_001",
  "address": {
    "full_address": "SUBJECT_PROPERTY_ADDRESS",
    "street_number": null,
    "street_name": null,
    "suburb": null,
    "state": "VIC",
    "postcode": null,
    "country": "AU",
    "latitude": null,
    "longitude": null
  },
  "property_type": "house",
  "property_type_confidence": "high",
  "council_lga": null,
  "source_refs": []
}
```

### 3.2 枚举

`property_type`:

- `house`
- `vacant_land`
- `townhouse`
- `villa`
- `apartment`
- `special_purpose`
- `other`
- `unknown`

`property_type_confidence`:

- `low`
- `medium`
- `high`

## 4. Lead

代表一个潜在客户。Lead 可以先从匿名地址搜索产生, 后续再升级为注册用户、完整报告用户或 PDF 下载用户。

```json
{
  "lead_id": "lead_001",
  "user_id": null,
  "email": "buyer@example.com",
  "name": "Example Buyer",
  "phone": null,
  "phone_required_completed": false,
  "purpose": "buy",
  "lead_status": "registered",
  "searched_address": "SUBJECT_PROPERTY_ADDRESS",
  "property_type": "house",
  "valuation_run_id": "val_001",
  "estimated_value_low": null,
  "estimated_value_high": null,
  "confidence_label": "pending_verified_comparables",
  "pdf_requested": false,
  "pdf_downloaded": false,
  "uploaded_document_count": 0,
  "created_at": "2026-06-02T11:10:00+10:00",
  "updated_at": "2026-06-02T11:10:00+10:00"
}
```

枚举:

- `purpose`: `buy`, `sell`, `invest`, `refinance`, `research`, `other`, `unknown`
- `lead_status`: `anonymous_search`, `email_captured`, `registered`, `full_report_unlocked`, `pdf_requested`, `pdf_downloaded`, `uploaded_documents`, `contact_consented`

## 5. ContactConsent

记录用户是否授权联系。普通注册时 consent 可选, PDF 下载前 consent 必填。

```json
{
  "consent_id": "consent_001",
  "lead_id": "lead_001",
  "consent_given": true,
  "consent_scope": ["phone", "sms", "email"],
  "consent_text": "I agree that you may contact me by phone, SMS or email about this property report.",
  "consent_context": "pdf_download",
  "consent_timestamp": "2026-06-02T11:15:00+10:00",
  "ip_address": null,
  "user_agent": null
}
```

枚举:

- `consent_context`: `registration`, `full_report_unlock`, `pdf_download`, `manual_upload`

## 6. InvestorProfile

代表用户的投资偏好和投资人资格信息。该信息用于线索分层和 gating, 不应自动生成 personal financial advice。

```json
{
  "investor_profile_id": "inv_001",
  "lead_id": "lead_001",
  "investment_purpose": "invest",
  "intended_allocation_range": "$250k-$500k",
  "preferred_strategies": ["income", "private_credit"],
  "investment_horizon": "3_5_years",
  "risk_tolerance": "medium",
  "wholesale_status": "unknown",
  "sophisticated_investor_certificate_status": "not_provided",
  "smsf_investor": false,
  "australian_tax_resident": "unknown",
  "eligibility_review_status": "not_reviewed",
  "general_advice_acknowledged": false,
  "created_at": "2026-06-02T11:30:00+10:00",
  "updated_at": "2026-06-02T11:30:00+10:00"
}
```

枚举:

- `investment_purpose`: `buy`, `sell`, `invest`, `refinance`, `research`, `other`, `unknown`
- `preferred_strategies`: `capital_growth`, `income`, `development`, `private_credit`, `landbank`, `diversified`
- `investment_horizon`: `under_12_months`, `1_3_years`, `3_5_years`, `5_plus_years`, `unknown`
- `risk_tolerance`: `low`, `medium`, `high`, `unknown`
- `wholesale_status`: `unknown`, `retail`, `wholesale_self_declared`, `wholesale_verified`
- `sophisticated_investor_certificate_status`: `not_provided`, `provided_pending_review`, `verified`, `expired`, `not_applicable`
- `australian_tax_resident`: `yes`, `no`, `unknown`
- `eligibility_review_status`: `not_reviewed`, `pending`, `approved`, `rejected`, `requires_more_info`

## 7. InvestmentOpportunity

代表一个地产金融或私募机会。公开页面只展示 general information; 具体材料需要 eligibility gating。

```json
{
  "opportunity_id": "opp_001",
  "name": "Melbourne Property Credit Fund - Demo",
  "strategy_type": "private_credit",
  "status": "draft",
  "visibility": "eligible_investors_only",
  "target_market": "wholesale",
  "general_summary": "Property-backed private credit strategy, general information only.",
  "asset_location_summary": "Metropolitan Melbourne",
  "target_return_summary": null,
  "minimum_investment": null,
  "risk_summary": "Capital at risk. Terms and eligibility subject to offer documents.",
  "documents": [],
  "compliance_notes": "Requires AFSL / authorised representative / legal review before production.",
  "created_at": "2026-06-02T11:30:00+10:00"
}
```

枚举:

- `strategy_type`: `private_credit`, `development_equity`, `preferred_equity`, `landbank`, `income_property`, `other`
- `status`: `draft`, `active`, `closed`, `archived`
- `visibility`: `public_general_info`, `registered_only`, `eligible_investors_only`, `admin_only`
- `target_market`: `wholesale`, `retail`, `mixed`, `unknown`

## 8. OpportunityAccessLog

记录用户查看或下载投资机会材料的行为。

```json
{
  "access_log_id": "access_001",
  "lead_id": "lead_001",
  "opportunity_id": "opp_001",
  "access_type": "view_summary",
  "eligibility_status_at_access": "pending",
  "allowed": false,
  "reason": "Eligibility review required.",
  "created_at": "2026-06-02T11:35:00+10:00"
}
```

枚举:

- `access_type`: `view_summary`, `download_teaser`, `download_im`, `enter_dd_room`, `request_call`

## 9. SuburbProfile

代表 suburb 层面的基本面和对比分析。该实体可按 suburb/postcode 定期更新, 多个 property 可引用同一 suburb profile。

```json
{
  "suburb_profile_id": "suburb_oakleigh_3166",
  "suburb": "Oakleigh",
  "state": "VIC",
  "postcode": "3166",
  "lga": "Monash",
  "population": 8442,
  "median_household_income_weekly": 1926,
  "dominant_household_type": "families",
  "owner_occupier_ratio": 0.62,
  "renter_ratio": 0.35,
  "dominant_occupation_profile": ["professionals"],
  "median_age": 38,
  "median_house_price": 1400000,
  "median_unit_price": 575500,
  "house_12_month_growth": null,
  "unit_12_month_growth": null,
  "median_house_rent": null,
  "median_unit_rent": null,
  "house_rental_yield": null,
  "unit_rental_yield": null,
  "vacancy_pressure": "unknown",
  "days_on_market": null,
  "auction_clearance_rate": null,
  "major_employment_nodes": [
    "Chadstone Shopping Centre",
    "Monash University",
    "Monash Medical Centre"
  ],
  "transport_access_summary": "Oakleigh and Huntingdale train access, bus links and Monash Freeway access.",
  "school_access_summary": null,
  "comparison_suburbs": [
    "Hughesdale",
    "Huntingdale",
    "Oakleigh East",
    "Oakleigh South",
    "Clayton",
    "Murrumbeena"
  ],
  "relative_price_position": "middle_inner_south_east",
  "suburb_fundamentals_summary": "Family-oriented suburb with strong transport, retail and employment access.",
  "data_sources": [],
  "last_updated": "2026-06-01"
}
```

字段用途:

- 支持 suburb-level explanation
- 支持 rental demand assessment
- 支持 comparison suburb expansion
- 支持 medium-term growth / risk commentary

限制:

```text
Suburb fundamentals should explain market context, but should not override strong recent comparable sales.
```

## 10. LandProfile

代表土地本身的属性。

```json
{
  "property_id": "prop_001",
  "land_size_sqm": 650,
  "land_size_source": "portal",
  "land_size_confidence": "medium",
  "title_lot_plan_reference": null,
  "land_size_crosscheck_status": "not_crosschecked",
  "parent_child_address_ambiguity": false,
  "related_child_addresses": [],
  "frontage_m": null,
  "depth_m": null,
  "land_shape": "unknown",
  "slope": "unknown",
  "land_orientation": "unknown",
  "corner_block": false,
  "usable_land_rating": null,
  "development_potential_notes": null,
  "data_confidence": "medium"
}
```

枚举:

- `land_size_source`: `title_search`, `title_plan`, `survey_plan`, `council_record`, `vicplan_parcel`, `section_32`, `agent_statement`, `listing_portal`, `avm_profile`, `unknown`
- `land_size_confidence`: `low`, `medium`, `high`
- `land_size_crosscheck_status`: `not_crosschecked`, `matched_authoritative_source`, `conflict_found`, `requires_title_review`
- `land_shape`: `regular`, `irregular`, `battleaxe`, `unknown`
- `slope`: `flat`, `gentle`, `moderate`, `steep`, `unknown`
- `land_orientation`: `north`, `south`, `east`, `west`, `north_east`, `north_west`, `south_east`, `south_west`, `unknown`

## 11. BuildingProfile

代表房屋建筑和居住功能。

```json
{
  "property_id": "prop_001",
  "bedrooms": 5,
  "bathrooms": 2,
  "car_spaces": 2,
  "building_size_sqm": null,
  "main_entrance_orientation": "unknown",
  "main_living_area_orientation": "unknown",
  "backyard_orientation": "unknown",
  "year_built": null,
  "approximate_age_band": "unknown",
  "storeys": "unknown",
  "renovation_level": "unknown",
  "current_condition_rating": null,
  "structural_condition": "unknown",
  "floorplan_functionality_rating": null,
  "existing_secondary_dwelling": "unknown",
  "granny_flat_potential": "unknown",
  "deferred_maintenance_risk": "unknown",
  "renovation_since_last_sale": "unknown",
  "condition_notes": null,
  "data_confidence": "low"
}
```

枚举:

- `approximate_age_band`: `0_5`, `6_15`, `16_30`, `31_50`, `50_plus`, `unknown`
- `main_entrance_orientation`: `north`, `south`, `east`, `west`, `north_east`, `north_west`, `south_east`, `south_west`, `unknown`
- `main_living_area_orientation`: `north`, `south`, `east`, `west`, `north_east`, `north_west`, `south_east`, `south_west`, `unknown`
- `backyard_orientation`: `north`, `south`, `east`, `west`, `north_east`, `north_west`, `south_east`, `south_west`, `unknown`
- `storeys`: `single`, `double`, `triple_plus`, `unknown`
- `renovation_level`: `original`, `partly_updated`, `renovated`, `high_end_renovated`, `new_or_near_new`, `unknown`
- `structural_condition`: `poor`, `fair`, `good`, `excellent`, `unknown`
- `existing_secondary_dwelling`: `yes`, `no`, `unknown`
- `granny_flat_potential`: `none`, `low`, `medium`, `high`, `unknown`
- `deferred_maintenance_risk`: `none`, `minor`, `moderate`, `major`, `unknown`
- `renovation_since_last_sale`: `yes`, `no`, `unknown`

## 12. PlanningProfile

代表 title、zoning、overlay 和法律/规划限制。

```json
{
  "property_id": "prop_001",
  "title_type": "unknown",
  "zoning": null,
  "planning_overlays": [],
  "heritage_overlay": "unknown",
  "easements": [],
  "restrictive_covenants": [],
  "flood_risk": "unknown",
  "bushfire_risk": "unknown",
  "vegetation_controls": "unknown",
  "planning_risk_rating": "unknown",
  "development_constraints_notes": null,
  "data_confidence": "low"
}
```

枚举:

- `title_type`: `freehold`, `strata`, `company_share`, `other`, `unknown`
- `heritage_overlay`: `none`, `minor`, `material`, `unknown`
- `flood_risk`: `none`, `low`, `medium`, `high`, `unknown`
- `bushfire_risk`: `none`, `low`, `medium`, `high`, `unknown`
- `vegetation_controls`: `none`, `minor`, `material`, `unknown`
- `planning_risk_rating`: `none`, `minor`, `moderate`, `major`, `unknown`

## 13. RentalProfile

代表租金和收益。

```json
{
  "property_id": "prop_001",
  "estimated_weekly_rent": 880,
  "rent_estimate_low": 820,
  "rent_estimate_high": 950,
  "gross_yield": 0.032,
  "rental_demand_rating": "medium",
  "rental_notes": null,
  "data_confidence": "medium"
}
```

## 14. LoanScenario

代表基于估值的 LVR / 借款情景。该结果仅作 indicative scenario, 不是贷款批准或信贷建议。

```json
{
  "loan_scenario_id": "loan_001",
  "valuation_run_id": "val_001",
  "estimated_value_used": 1410000,
  "selected_lvr": 0.8,
  "indicative_max_loan": 1128000,
  "required_deposit_or_equity": 282000,
  "purchase_price": null,
  "shortfall_or_surplus": null,
  "stamp_duty_and_costs": null,
  "income_serviceability_required": "not_assessed",
  "loan_scenario_disclaimer": "Indicative LVR scenario only. Not a loan approval or credit assessment."
}
```

字段:

- `selected_lvr`: 0.60, 0.70, 0.80 etc.
- `estimated_value_used`: low / midpoint / high 中被用于计算的值
- `indicative_max_loan`: estimated value × selected LVR
- `required_deposit_or_equity`: estimated value - indicative max loan
- `purchase_price`: 用户输入购买价, optional
- `shortfall_or_surplus`: valuation scenario vs purchase price, optional
- `income_serviceability_required`: `not_assessed`, `required`, `provided`, `failed`, `unknown`

## 15. MicroLocationProfile

代表街道和微位置评估。

```json
{
  "property_id": "prop_001",
  "street_type": "quiet_residential",
  "street_grade": "A",
  "street_rank_in_suburb": "top_25",
  "street_rank_basis": [
    "same_street_sales",
    "school_zone",
    "village_walkability"
  ],
  "quiet_vs_busy": "quiet",
  "streetscape_score": 4,
  "tree_canopy_score": 4,
  "street_tree_maturity": "medium_high",
  "housing_quality_consistency": "consistent",
  "traffic_noise_score": 2,
  "main_road_noise_exposure": "low",
  "near_main_road_distance_m": null,
  "access_friction_score": 2,
  "directional_access_notes": "Peak-hour right-turn friction to be checked.",
  "amenity_walkability_score": 5,
  "public_transport_access": "strong",
  "village_or_shopping_access": "strong",
  "park_access": "good",
  "school_access": "strong",
  "school_zone_premium": "strong",
  "negative_externalities": "none_obvious",
  "street_reputation_notes": "Residential street near North Balwyn Village.",
  "street_length_m": null,
  "distance_to_nearest_connector_road_m": null,
  "distance_to_nearest_arterial_road_m": null,
  "number_of_exit_routes": null,
  "cul_de_sac_or_no_through_road": false,
  "road_width_rating": "unknown",
  "kerbside_parking_availability": "unknown",
  "parking_pressure_rating": "unknown",
  "passing_width_comfort": "unknown",
  "driveway_access_difficulty": "unknown",
  "school_or_shopping_parking_spillover": "unknown",
  "street_access_notes": null,
  "micro_location_adjustment_pct_low": 0.04,
  "micro_location_adjustment_pct_high": 0.07,
  "data_confidence": "medium"
}
```

### 8.1 枚举

`street_type`:

- `quiet_residential`
- `normal_residential`
- `connector_road`
- `busy_road`
- `main_road`
- `cul_de_sac`
- `court`
- `unknown`

`street_grade`:

- `A`
- `B`
- `C`
- `D`
- `unknown`

`street_rank_in_suburb`:

- `top_10`
- `top_25`
- `middle_50`
- `bottom_25`
- `compromised_avoid`
- `unknown`

`quiet_vs_busy`:

- `quiet`
- `normal`
- `connector`
- `busy`
- `main_road`
- `unknown`

`amenity access fields`:

- `weak`
- `normal`
- `good`
- `strong`
- `unknown`

`road_width_rating`:

- `narrow`
- `normal`
- `wide`
- `unknown`

`kerbside_parking_availability`:

- `easy`
- `moderate`
- `constrained`
- `very_constrained`
- `unknown`

`parking_pressure_rating`:

- `low`
- `medium`
- `high`
- `unknown`

`passing_width_comfort`:

- `comfortable`
- `acceptable`
- `tight`
- `difficult`
- `unknown`

`driveway_access_difficulty`:

- `easy`
- `moderate`
- `difficult`
- `unknown`

`school_or_shopping_parking_spillover`:

- `none`
- `minor`
- `moderate`
- `severe`
- `unknown`

## 16. SecondaryDwellingProfile

当 property type 为 `house` 时可使用。用于评估已有 granny flat 或未来加建 secondary dwelling 的潜力。

```json
{
  "property_id": "prop_001",
  "existing_secondary_dwelling": "unknown",
  "granny_flat_potential": "medium",
  "rear_yard_depth_m": null,
  "rear_yard_access": "unknown",
  "side_access_width_m": null,
  "site_coverage_estimate": null,
  "private_open_space_remaining_rating": "unknown",
  "services_connection_feasibility": "unknown",
  "planning_secondary_dwelling_constraints": [],
  "planning_feasibility_band": "unknown_need_manual_review",
  "zone_support_score": null,
  "overlay_constraint_score": null,
  "easement_constraint_score": null,
  "covenant_constraint_score": null,
  "site_layout_score": null,
  "neighbourhood_character_score": null,
  "neighbour_amenity_risk_score": null,
  "neighbouring_built_form": {
    "adjacent_building_height": "unknown",
    "rear_setback_pattern": "unknown",
    "nearby_secondary_dwellings_observed": "unknown",
    "nearby_dual_occupancy_pattern": "unknown",
    "overlooking_risk": "unknown",
    "overshadowing_risk": "unknown",
    "visual_bulk_risk": "unknown"
  },
  "aerial_imagery_reviewed": false,
  "street_view_reviewed": false,
  "vicplan_report_reviewed": false,
  "council_planning_scheme_reviewed": false,
  "nearby_planning_permits_reviewed": false,
  "imagery_source": null,
  "granny_flat_notes": "Potential requires planning and building confirmation.",
  "data_confidence": "low"
}
```

枚举:

- `existing_secondary_dwelling`: `yes`, `no`, `unknown`
- `granny_flat_potential`: `none`, `low`, `medium`, `high`, `unknown`
- `rear_yard_access`: `direct_side_access`, `narrow_side_access`, `pedestrian_only`, `no_clear_access`, `unknown`
- `private_open_space_remaining_rating`: `poor`, `fair`, `good`, `excellent`, `unknown`
- `services_connection_feasibility`: `easy`, `moderate`, `difficult`, `unknown`
- `planning_feasibility_band`: `likely_permissible`, `possible_subject_to_constraints`, `difficult_or_high_risk`, `unlikely`, `unknown_need_manual_review`
- `adjacent_building_height`: `single_storey`, `double_storey`, `three_storey_plus`, `mixed`, `unknown`
- `rear_setback_pattern`: `consistent_deep_rear_yards`, `mixed`, `rear_development_common`, `unknown`
- `nearby_secondary_dwellings_observed`: `yes`, `no`, `unknown`
- `nearby_dual_occupancy_pattern`: `common`, `some`, `rare`, `unknown`
- `overlooking_risk`: `low`, `medium`, `high`, `unknown`
- `overshadowing_risk`: `low`, `medium`, `high`, `unknown`
- `visual_bulk_risk`: `low`, `medium`, `high`, `unknown`

限制:

```text
This profile can flag potential only. It must not represent planning or building approval.
```

## 17. TownhouseProfile

当 `property_type = townhouse` 时使用。Townhouse 共享 Property、LandProfile、BuildingProfile、PlanningProfile、RentalProfile 和 MicroLocationProfile, 但需要额外记录 complex、frontage、private open space 和 body corporate 相关字段。

```json
{
  "property_id": "prop_002",
  "internal_area_sqm": 180,
  "land_component_sqm": 220,
  "private_open_space_sqm": 35,
  "number_of_levels": 2,
  "street_frontage": true,
  "own_street_address": true,
  "own_driveway": true,
  "garage_type": "lock_up_garage",
  "attached_sides": 1,
  "number_in_complex": 3,
  "position_in_complex": "front",
  "shared_driveway": false,
  "common_area_quality": "good",
  "builder_quality": "unknown",
  "privacy_overlooking_risk": "low",
  "energy_efficiency_rating": null,
  "townhouse_adjustment_notes": [
    "Street-facing townhouse with own driveway."
  ],
  "data_confidence": "medium"
}
```

枚举:

- `garage_type`: `lock_up_garage`, `carport`, `open_space`, `basement`, `none`, `unknown`
- `position_in_complex`: `front`, `middle`, `rear`, `standalone`, `unknown`
- `common_area_quality`: `poor`, `fair`, `good`, `excellent`, `unknown`
- `builder_quality`: `poor`, `fair`, `good`, `premium`, `unknown`
- `privacy_overlooking_risk`: `none`, `low`, `medium`, `high`, `unknown`

## 18. VillaProfile

当 `property_type = villa` 时使用。Villa 指低密度 villa unit, 不包括高层 apartment。

```json
{
  "property_id": "prop_003",
  "unit_internal_area_sqm": 145,
  "land_component_sqm": 300,
  "private_courtyard_sqm": 45,
  "single_level": true,
  "number_in_block": 4,
  "position_in_block": "rear",
  "street_frontage": false,
  "own_driveway": false,
  "garage_or_carport": "garage",
  "common_insurance_or_shared_costs": "unknown",
  "owner_occupier_ratio": null,
  "privacy_rating": "good",
  "noise_exposure_within_block": "low",
  "renovation_level": "renovated",
  "accessibility_single_level_premium": true,
  "villa_adjustment_notes": [
    "Single-level rear villa with private courtyard."
  ],
  "data_confidence": "medium"
}
```

枚举:

- `position_in_block`: `front`, `middle`, `rear`, `standalone`, `unknown`
- `garage_or_carport`: `garage`, `carport`, `open_space`, `none`, `unknown`
- `privacy_rating`: `poor`, `fair`, `good`, `excellent`, `unknown`
- `noise_exposure_within_block`: `none`, `low`, `medium`, `high`, `unknown`

## 19. VacantLandProfile

当 `property_type = vacant_land` 时使用。Vacant Land 包括空地、可建住宅土地、可推倒重建地块和潜在开发地。

```json
{
  "property_id": "prop_004",
  "vacant_land_type": "residential_vacant_land",
  "land_size_sqm": 650,
  "frontage_m": 16.5,
  "depth_m": 39.5,
  "buildable_area_sqm": null,
  "services_available": {
    "water": "unknown",
    "sewer": "unknown",
    "electricity": "unknown",
    "gas": "unknown",
    "nbn": "unknown"
  },
  "road_access": "sealed_road",
  "soil_or_contamination_risk": "unknown",
  "demolition_required": false,
  "estimated_demolition_cost": null,
  "subdivision_potential": "unknown",
  "development_yield_potential": null,
  "highest_and_best_use_notes": null,
  "land_value_adjustment_notes": [],
  "data_confidence": "medium"
}
```

枚举:

- `vacant_land_type`: `residential_vacant_land`, `knockdown_rebuild_site`, `development_site`, `subdivision_potential_land`, `unknown`
- `road_access`: `sealed_road`, `unsealed_road`, `limited_access`, `unknown`
- `soil_or_contamination_risk`: `none`, `low`, `medium`, `high`, `unknown`
- `subdivision_potential`: `none`, `possible`, `likely`, `unknown`
- `services_available` values: `yes`, `no`, `nearby`, `unknown`

## 20. ApartmentProfile

当 `property_type = apartment` 时使用。Apartment 第一阶段先记录字段和 prototype, 完整估值模型放到 Phase 2。

```json
{
  "property_id": "prop_005",
  "internal_area_sqm": 82,
  "balcony_area_sqm": 10,
  "total_area_sqm": 92,
  "floor_level": 5,
  "aspect": "north",
  "view_quality": "district",
  "storage_cage": true,
  "car_park_on_title": true,
  "building_age_band": "6_15",
  "building_height": "mid_rise",
  "number_of_apartments_in_building": 80,
  "facilities": ["lift", "gym"],
  "cladding_or_defect_risk": "unknown",
  "owner_occupier_ratio": null,
  "short_stay_restrictions": "unknown",
  "noise_exposure": "low",
  "lending_restriction_risk": "unknown",
  "apartment_adjustment_notes": [],
  "data_confidence": "low"
}
```

枚举:

- `aspect`: `north`, `south`, `east`, `west`, `north_east`, `north_west`, `south_east`, `south_west`, `unknown`
- `view_quality`: `none`, `street`, `district`, `park`, `city`, `water`, `premium`, `unknown`
- `building_age_band`: `0_5`, `6_15`, `16_30`, `31_plus`, `unknown`
- `building_height`: `low_rise`, `mid_rise`, `high_rise`, `unknown`
- `cladding_or_defect_risk`: `none`, `low`, `medium`, `high`, `unknown`
- `short_stay_restrictions`: `yes`, `no`, `unknown`
- `lending_restriction_risk`: `none`, `low`, `medium`, `high`, `unknown`

## 21. BodyCorporateProfile

Townhouse、Villa 和 Apartment 可能存在 owners corporation / body corporate。若无 body corporate, 也应记录为 `not_applicable` 或 `none_confirmed`。

```json
{
  "property_id": "prop_002",
  "body_corporate_status": "active",
  "annual_fee": 1800,
  "fee_confidence": "medium",
  "common_insurance_included": true,
  "common_maintenance_responsibility": "shared_driveway_and_common_area",
  "sinking_fund_or_special_levy_risk": "unknown",
  "body_corporate_risk_rating": "minor",
  "body_corporate_notes": null
}
```

枚举:

- `body_corporate_status`: `none_confirmed`, `active`, `informal`, `not_applicable`, `unknown`
- `fee_confidence`: `low`, `medium`, `high`
- `sinking_fund_or_special_levy_risk`: `none`, `low`, `medium`, `high`, `unknown`
- `body_corporate_risk_rating`: `none`, `minor`, `moderate`, `major`, `unknown`

## 22. DueDiligenceCheck

记录每个 property 的自动核查和人工待补资料。

```json
{
  "check_id": "dd_001",
  "property_id": "prop_001",
  "check_type": "land_title",
  "check_method": "manual_upload_required",
  "status": "required",
  "source_name": "Landata / Land Use Victoria",
  "source_url": "https://www.landata.vic.gov.au/",
  "result_summary": "Title plan required to confirm land size and subdivision structure.",
  "evidence_refs": [],
  "conflict_detected": true,
  "confidence_impact": "caps_confidence_low_medium",
  "last_checked_at": null
}
```

`check_type`:

- `portal_crosscheck`
- `related_address_detection`
- `recent_sales_scan`
- `rental_estimate_crosscheck`
- `vicplan_report`
- `council_planning_register`
- `council_public_maps`
- `google_maps_aerial`
- `street_view`
- `nearby_built_form`
- `land_title`
- `plan_of_subdivision`
- `section_32`
- `contract_of_sale`
- `council_building_records`
- `body_corporate_certificate`
- `inspection_photos`
- `inspection_notes`

`check_method`:

- `automatic_public`
- `manual_upload_required`
- `manual_input_required`
- `paid_search_required`
- `not_available`

`status`:

- `not_started`
- `completed`
- `failed`
- `required`
- `not_applicable`
- `conflict_found`

`confidence_impact`:

- `none`
- `caps_confidence_medium`
- `caps_confidence_low_medium`
- `lowers_confidence`
- `may_upgrade_if_resolved`

## 23. ComparableSale

代表一个已成交可比房。

```json
{
  "comparable_sale_id": "comp_001",
  "address": {
    "full_address": "VERIFIED_COMPARABLE_ADDRESS",
    "suburb": null,
    "postcode": null,
    "latitude": null,
    "longitude": null
  },
  "property_type": "house",
  "sale_date": null,
  "sale_price": null,
  "land_size_sqm": null,
  "bedrooms": null,
  "bathrooms": null,
  "car_spaces": null,
  "condition_summary": null,
  "micro_location_summary": null,
  "source_refs": ["https://source.example/required"],
  "data_reliability": "pending"
}
```

## 24. ComparableSelection

记录某次估值中哪些 comparable 被选中、如何加权、如何调整。

```json
{
  "valuation_run_id": "val_001",
  "comparable_sale_id": "comp_001",
  "selected": true,
  "selection_reason": "Same street, similar land size, recent sale.",
  "excluded_reason": null,
  "recency_weight": 0.75,
  "location_similarity": 1.0,
  "property_similarity": 0.9,
  "condition_similarity": 0.8,
  "data_reliability": 0.8,
  "final_comparable_weight": 0.216,
  "raw_sale_price": null,
  "adjusted_sale_price": null,
  "adjustment_notes": [
    "Comparable has stronger bathrooms and car spaces than target."
  ]
}
```

`final_comparable_weight` 应在同一个 `valuation_run_id` 的 selected comparable 内归一化。

## 25. ValuationRun

代表一次估值运行。

```json
{
  "valuation_run_id": "val_001",
  "model_version_id": "model_house_melb_v0_1",
  "property_id": "prop_001",
  "run_type": "first_layer_desktop",
  "valuation_date": "2026-05-29",
  "input_mode": "address_only",
  "status": "completed",
  "notes": null
}
```

枚举:

- `run_type`: `first_layer_desktop`, `enhanced`, `backtest`
- `input_mode`: `address_only`, `address_plus_manual_fields`, `full_review`
- `status`: `draft`, `completed`, `failed`, `needs_review`

## 26. ValuationResult

代表最终估值输出。

```json
{
  "valuation_run_id": "val_001",
  "estimated_value_low": null,
  "estimated_value_high": null,
  "model_midpoint": null,
  "confidence_label": "pending_verified_comparables",
  "confidence_score": null,
  "comparable_baseline": null,
  "comparable_influence_pct": null,
  "summary_reasons": [
    "No valuation is stored until verified comparable evidence passes validation."
  ],
  "missing_checks": [
    "current_condition",
    "title_planning",
    "complete_recent_comparable_pool"
  ]
}
```

## 27. AdjustmentBreakdown

记录每个调整因子，支持解释和回测。

```json
{
  "valuation_run_id": "val_001",
  "time_market_factor": 1.0,
  "land_factor": 1.0,
  "building_utility_factor": 1.03,
  "current_condition_factor": 0.98,
  "micro_location_factor": 1.05,
  "planning_title_risk_factor": 1.0,
  "final_factor_product": 1.059,
  "factor_notes": {
    "building_utility": "Target has stronger bedroom utility than smaller same-street comparable.",
    "condition": "Current condition not confirmed, slight uncertainty discount.",
    "micro_location": "Top 25% street rank within Balwyn North, estimated."
  }
}
```

## 28. ConfidenceScore

记录 confidence 的组成部分。

```json
{
  "valuation_run_id": "val_001",
  "comparable_quality_score": 22,
  "data_completeness_score": 13,
  "property_type_certainty_score": 10,
  "condition_certainty_score": 7,
  "planning_title_certainty_score": 6,
  "model_backtest_reliability_score": 6,
  "total_score": 64,
  "label": "medium",
  "confidence_notes": [
    "Comparable evidence is usable but not a complete sales pool.",
    "Current condition and planning/title checks are incomplete."
  ]
}
```

权重:

- Comparable Quality: 30
- Data Completeness: 20
- Property Type Certainty: 10
- Condition Certainty: 15
- Planning / Title Certainty: 15
- Model Back-test Reliability: 10

## 29. BacktestRun

代表一次回测任务。

```json
{
  "backtest_run_id": "bt_001",
  "model_version_id": "model_house_melb_v0_1",
  "suburb": "Balwyn North",
  "property_type": "house",
  "sample_period_start": "2025-01-01",
  "sample_period_end": "2026-05-29",
  "created_at": "2026-05-29T16:00:00+10:00",
  "notes": "v0 manual back-test"
}
```

## 30. BacktestSample

代表回测中的一个已成交样本。

```json
{
  "backtest_sample_id": "bt_sample_001",
  "backtest_run_id": "bt_001",
  "target_property_id": "prop_bt_001",
  "target_sale_date": null,
  "actual_sale_price": null,
  "valuation_run_id": "val_bt_001",
  "model_estimated_low": null,
  "model_estimated_high": null,
  "model_midpoint": null,
  "error_amount": null,
  "error_pct": null,
  "absolute_error_pct": null,
  "range_hit": null,
  "direction": null,
  "main_error_cause": null
}
```

## 31. BacktestMetrics

代表一个回测任务的汇总指标。

```json
{
  "backtest_run_id": "bt_001",
  "sample_count": 7,
  "range_hit_rate": 1.0,
  "mean_absolute_percentage_error": 0.018,
  "median_absolute_percentage_error": null,
  "overestimate_rate": null,
  "underestimate_rate": null,
  "largest_error_sample_id": "bt_sample_003",
  "metrics_by_confidence": {},
  "metrics_by_street_rank": {},
  "metrics_by_land_size_band": {}
}
```

## 32. ModelVersion

记录估值模型版本，支持回测和复现。

```json
{
  "model_version_id": "model_house_melb_v0_1",
  "name": "Metropolitan Melbourne House MVP v0.1",
  "property_type": "house",
  "market": "Metropolitan Melbourne",
  "created_at": "2026-05-29T16:00:00+10:00",
  "comparable_influence_rules": {
    "strong_recent_evidence": "60%-70%",
    "normal_recent_evidence": "55%-65%",
    "weak_recent_evidence": "45%-55%"
  },
  "notes": "Initial PRD-based rules model."
}
```

## 33. 关系设计

```text
SuburbProfile 1 ── N Property
Lead 1 ── N ContactConsent
Lead 1 ── 0..1 InvestorProfile
Lead 1 ── N OpportunityAccessLog
InvestmentOpportunity 1 ── N OpportunityAccessLog
Lead 0..1 ── N ValuationRun
Property 1 ── 1 LandProfile
Property 1 ── 1 BuildingProfile
Property 1 ── 1 PlanningProfile
Property 1 ── 1 RentalProfile
ValuationRun 1 ── N LoanScenario
Property 1 ── 1 MicroLocationProfile
Property 1 ── 0..1 SecondaryDwellingProfile
Property 1 ── 0..1 TownhouseProfile
Property 1 ── 0..1 VillaProfile
Property 1 ── 0..1 VacantLandProfile
Property 1 ── 0..1 ApartmentProfile
Property 1 ── 0..1 BodyCorporateProfile
Property 1 ── N DueDiligenceCheck

Property 1 ── N ValuationRun
ValuationRun 1 ── 1 ValuationResult
ValuationRun 1 ── 1 AdjustmentBreakdown
ValuationRun 1 ── 1 ConfidenceScore
ValuationRun 1 ── N ComparableSelection
ComparableSale 1 ── N ComparableSelection

ModelVersion 1 ── N ValuationRun
ModelVersion 1 ── N BacktestRun
BacktestRun 1 ── N BacktestSample
BacktestRun 1 ── 1 BacktestMetrics
BacktestSample 1 ── 1 ValuationRun
```

## 34. 第一版 API 形状草案

### 34.1 创建估值

```http
POST /valuations
```

Request:

```json
{
  "address": "SUBJECT_PROPERTY_ADDRESS",
  "property_type_hint": "house",
  "input_mode": "address_only"
}
```

Response:

```json
{
  "valuation_run_id": "val_001",
  "estimated_value_low": null,
  "estimated_value_high": null,
  "model_midpoint": null,
  "confidence_label": "pending_verified_comparables",
  "micro_location": {
    "street_rank_in_suburb": "top_25",
    "quiet_vs_busy": "quiet",
    "amenity_walkability_score": 5
  },
  "key_comparables": [
    {
      "address": "VERIFIED_COMPARABLE_ADDRESS",
      "sale_price": null,
      "sale_date": null,
      "source_url": "https://source.example/required"
    }
  ],
  "missing_checks": [
    "current_condition",
    "title_planning",
    "complete_recent_comparable_pool"
  ]
}
```

### 34.2 补充信息后重估

```http
POST /valuations/{valuation_run_id}/revise
```

Request:

```json
{
  "current_condition_rating": 4,
  "renovation_level": "renovated",
  "title_type": "freehold",
  "planning_risk_rating": "none",
  "notes": "Current condition confirmed by inspection."
}
```

## 35. 开放问题

- 第一版使用哪个数据源获得 reliable comparable sales?
- Street ranking 是否先由人工标注，再逐步自动化?
- 是否需要保存所有 raw source evidence?
- 是否需要 PostGIS 支持距离、街区和 main road exposure?
- Back-test 是否先按 suburb 手工跑，再做自动化?
