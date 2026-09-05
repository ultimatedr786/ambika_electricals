# REWARDLY — AMBIKA ELECTRICALS
# MASTER IMPLEMENTATION SPECIFICATION — PHASE 1 + PHASE 1.1

## Agent execution instruction

Read this entire specification before writing code. First inspect the existing repository, its routes, components, design system, and current working flows. Extend and polish what exists; do not rebuild functioning UI unnecessarily.

This is a **frontend-only** build. Use local mock data and local frontend state. Do **not** add Supabase, PostgreSQL, a real database, backend routes, real APIs, real authentication, real payments, real WhatsApp/SMS/email, or production QR verification.

### Required stack and visual direction (applies to both phases)

- Build with **Next.js**, React, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Lucide icons, Motion, React Hook Form, Zod, and Recharts.
- Use **Three.js** (preferably React Three Fiber / Drei when appropriate) for an original, lightweight, subtle animated electrical-reward visual on the **Login** and **Create Account** pages. Examples: an abstract glowing circuit/lightning path, floating point tokens, QR/product card elements, or a refined electric spark. It must be responsive, performant, accessible, reduced-motion aware, and must not make the form difficult to read or use.
- The rest of the application must use modern, animated **shadcn/ui-based** interface patterns: polished dialogs, drawers, sheets, cards, tooltips, toasts, tabs, command/search, dropdowns, skeletons, empty/error/success states, and subtle Motion transitions. Keep it premium and restrained—never a generic template, excessive gradients, heavy shadows, oversized icons, or childish animation.
- All product, reward, campaign, sale, customer-history, and business mock data must remain specific to an Indian electrical retailer. Do not use cafe, food, clothing, or generic ecommerce data.
- Keep components modular, typed, responsive, and accessible. Ensure natural browser/in-app back behavior and test important flows on mobile and desktop.

---

# SOURCE SPECIFICATION: PHASE 1

# REWARDLY — PHASE 1

# AMBIKA ELECTRICALS

## Premium UI/UX + Fully Interactive Frontend Prototype

You are a senior product designer, UX engineer, frontend architect and frontend developer.

Build a **premium, modern, production-quality frontend prototype** for a customer loyalty and rewards platform for an electrical retail business called:

# AMBIKA ELECTRICALS

This is **PHASE 1 ONLY**.

The goal is to build the complete UI/UX and frontend interaction experience first.

DO NOT build the backend yet.

---

# 1. VERY IMPORTANT — PHASE 1 SCOPE

This phase must focus ONLY on:

* UI/UX
* frontend
* responsive design
* mobile experience
* desktop experience
* navigation
* animations
* interactions
* forms
* modals
* drawers
* filters
* search
* sorting
* charts
* mock data
* local frontend state
* customer experience
* business owner experience
* staff experience

DO NOT implement:

* Supabase
* PostgreSQL
* real database
* real API
* backend
* real authentication
* real payments
* real WhatsApp
* real SMS
* real email
* production QR verification
* production points ledger

Use realistic local/mock data.

However, the frontend must be **fully interactive**.

Buttons should work.

Forms should work.

Dialogs should work.

Search should work.

Filters should work.

Navigation should work.

Mock sales should update the UI.

Mock reward redemption should update points and activity.

The application should feel like a real finished product even though the backend does not exist yet.

---

# 2. BUSINESS

Business name:

**Ambika Electricals**

Business type:

**Electrical Retail Store**

Business description:

A modern electrical products retailer selling electrical fittings, lighting products, wires, cables, switches, sockets, protection devices, fans, accessories and related electrical items.

Use Ambika Electricals consistently throughout the application.

Do NOT use:

Urban Brew Coffee
restaurant
cafe
food
coffee
clothing
generic ecommerce data

EVERY product, sale, category, reward and business-related mock dataset must be related to electrical products.

---

# 3. PRODUCT VISION

Build a modern loyalty/rewards system where customers earn points when purchasing electrical products from Ambika Electricals.

Example:

Customer purchases:

10 LED Bulbs
+
2 Modular Switches
+
1 MCB

The owner/staff creates the sale.

The system calculates mock reward points based on configured rules.

Customer sees:

"Purchase completed 🎉"

"You earned 185 points."

Customer can later redeem points for:

* discounts
* electrical accessories
* coupons
* free products
* special offers

---

# 4. PRIMARY PURCHASE FLOW

The PRIMARY purchase flow must be:

## Customer QR + Owner/Staff Creates Sale

Customer opens their membership QR.

Staff clicks:

"Scan Customer QR"

Mock scanner opens.

Simulate successful scan.

Customer is identified.

Staff creates sale.

Flow:

Scan Customer QR
→ Customer identified
→ Select electrical products
→ Quantity
→ Cart
→ Sale total
→ Estimated reward points
→ Complete Sale
→ Success
→ Customer points updated
→ Activity updated
→ Sales updated

This is the most important business interaction in the application.

Make it extremely polished.

---

# 5. SECONDARY PURCHASE FLOW

Also provide a button:

"Select Customer"

Staff can search:

* customer name
* phone
* membership ID

Then select customer without scanning.

This is a frontend alternative to QR.

---

# 6. DESIGN QUALITY

The application must look like a **premium modern SaaS + fintech + retail loyalty platform**.

Design inspiration can include the quality principles of:

* Linear
* Stripe
* modern banking apps
* premium ecommerce
* modern POS systems
* Apple-like simplicity

Do NOT copy any existing company's branding.

Create an original visual identity for:

**Ambika Electricals Rewards**

The interface should feel:

* trustworthy
* premium
* clean
* modern
* professional
* easy to understand
* fast
* polished

Avoid:

* childish design
* excessive gradients
* excessive rounded cards
* generic Bootstrap appearance
* cluttered dashboards
* oversized icons
* excessive shadows
* excessive animations

---

# 7. BRANDING

Primary business brand:

**Ambika Electricals**

Create a modern logo treatment based on:

* electrical spark
* lightning
* power
* circuit
* modern geometric symbol

Use an elegant electrical-industry visual identity.

The logo should work at:

16px
24px
32px
48px

Customer-facing loyalty experience should visually feel connected to Ambika Electricals.

---

# 8. TECHNOLOGY

Use:

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Radix UI
* Lucide Icons
* Motion
* React Hook Form
* Zod
* Recharts

Use current stable versions compatible with the project.

Avoid unnecessary libraries.

---

# 9. FRONTEND ARCHITECTURE

Use a clean architecture such as:

app/
components/
components/ui/
components/customer/
components/business/
components/shared/
lib/
lib/mock-data/
lib/services/
hooks/
types/
styles/

Separate:

* UI
* business/domain components
* mock services
* types
* utilities

Do not put large amounts of business logic inside page components.

---

# 10. MOCK DATA ARCHITECTURE

Create realistic mock data files.

For example:

/lib/mock-data/business.ts
/lib/mock-data/customers.ts
/lib/mock-data/products.ts
/lib/mock-data/sales.ts
/lib/mock-data/rewards.ts
/lib/mock-data/transactions.ts
/lib/mock-data/campaigns.ts
/lib/mock-data/challenges.ts
/lib/mock-data/tiers.ts
/lib/mock-data/stores.ts
/lib/mock-data/staff.ts

Create mock service functions such as:

getCustomers()
getCustomer()
getProducts()
getRewards()
getSales()
getTransactions()
getDashboardStats()
createMockSale()
redeemMockReward()
createMockCustomer()
createMockProduct()

Phase 2 can later replace these mock services with real backend services.

---

# 11. ALL MOCK PRODUCTS MUST BE ELECTRICAL

This is mandatory.

Use realistic electrical retail products.

Suggested categories:

## Lighting

* LED Bulbs
* LED Tube Lights
* LED Panel Lights
* LED Downlights
* LED Spotlights
* Emergency Lights
* Flood Lights
* Street Lights

## Switches & Sockets

* 1-Way Switch
* 2-Way Switch
* Modular Switch
* 2-Pin Socket
* 3-Pin Socket
* USB Socket
* Bell Push
* Fan Regulator
* Dimmer

## Wires & Cables

* House Wire
* FR Wire
* FRLS Wire
* Copper Cable
* Flexible Cable
* Coaxial Cable
* Speaker Wire
* Ethernet Cable

## Protection

* MCB
* RCCB
* RCBO
* Isolator
* Surge Protector
* Fuse
* Fuse Holder

## Distribution

* Distribution Box
* SPN DB
* TPN DB
* Busbar
* Neutral Link
* Earth Bar

## Fans

* Ceiling Fan
* Exhaust Fan
* Wall Fan
* Table Fan
* Ventilation Fan

## Electrical Accessories

* Bulb Holder
* Ceiling Rose
* Plug Top
* Cable Tie
* Junction Box
* PVC Conduit
* Conduit Bend
* Cable Gland
* Terminal Block
* Electrical Tape

Do not use non-electrical products.

---

# 12. REALISTIC PRODUCT DATA

Each product should have:

* product name
* SKU
* category
* subcategory
* brand
* price
* optional MRP
* unit
* stock
* points
* image
* status

Example:

Product:

"9W LED Bulb"

Brand:

"Philips"

Category:

Lighting

Price:

₹120

Points:

12

SKU:

AMB-LGT-009

Use realistic Indian electrical retail pricing.

Do not make all prices identical.

---

# 13. PRODUCT BRANDS

Use realistic electrical brands in demo data, such as:

* Philips
* Havells
* Polycab
* Finolex
* Anchor
* Schneider Electric
* Legrand
* Wipro
* Crompton
* Orient
* Bajaj
* RR Kabel

The application is a demo prototype.

Do not imply official affiliation with these brands.

---

# 14. DEMO BUSINESS

Use:

**Ambika Electricals**

Example stores:

* Ambika Electricals — Main Store
* Ambika Electricals — City Branch

Business dashboard should reflect an electrical retailer.

---

# 15. DEMO CUSTOMER

Use:

**Rahul Sharma**

Customer:

Rahul Sharma

Membership:

AE-10248

Tier:

Gold

Points:

2,450

Lifetime spend:

₹68,450

Purchases:

24

Referral count:

3

Use realistic electrical purchase history.

Example:

* 10 × 9W LED Bulbs
* 4 × Modular Switches
* 2 × 16A Sockets
* 1 × MCB
* 1 × Ceiling Fan

---

# 16. OTHER DEMO CUSTOMERS

Create realistic customers:

* Priya Patel
* Amit Shah
* Neha Mehta
* Rakesh Patel
* Kunal Shah
* Mehul Desai
* Pooja Joshi
* Vishal Patel
* Sneha Shah
* Jay Mehta

Use realistic Indian names.

Give each:

* points
* tier
* purchases
* lifetime spend
* last purchase
* referral count

---

# 17. LOYALTY TIERS

Default tiers:

BRONZE

0–999 points

SILVER

1,000–4,999 points

GOLD

5,000–14,999 points

PLATINUM

15,000+ points

Each tier should have:

* name
* icon
* progress
* benefits
* points multiplier

Example:

Bronze:
1x points

Silver:
1.25x points

Gold:
1.5x points

Platinum:
2x points

---

# 18. CUSTOMER APP

Create a premium customer loyalty experience.

Routes:

/customer/dashboard
/customer/rewards
/customer/rewards/[id]
/customer/activity
/customer/challenges
/customer/referrals
/customer/membership
/customer/profile
/customer/notifications

---

# 19. CUSTOMER MOBILE NAVIGATION

Bottom navigation:

Home
Rewards
Activity
Challenges
Profile

Make it elegant and app-like.

Use icons + labels.

Active navigation state must be obvious.

---

# 20. CUSTOMER DASHBOARD

Route:

/customer/dashboard

Above the fold:

"Hi Rahul 👋"

"Ambika Electricals"

Large points card:

2,450 Points

Approximate value:

Worth ₹245

Tier:

GOLD

Progress:

550 points to Platinum

Then quick actions:

Show QR
Rewards
Activity

Then:

Featured Reward

Recent Activity

Active Challenge

Recommended Offer

---

# 21. CUSTOMER POINTS CARD

Make points card interactive.

Click:

Open points details.

Show:

Current points
Earned this month
Redeemed this month
Expiring points
Lifetime points

Include a small visual chart.

---

# 22. MEMBERSHIP QR

Customer membership card should show:

Ambika Electricals

Rahul Sharma

Member ID:

AE-10248

Gold

2,450 points

QR code

Button:

"Show QR"

Click opens full-screen mobile-friendly QR sheet.

Text:

"Show this QR at checkout"

Use a mock QR.

Do not encode sensitive information.

---

# 23. REWARDS PAGE

Route:

/customer/rewards

Create an attractive rewards marketplace specifically for Ambika Electricals.

Categories:

All
Discounts
Electrical Products
Coupons
Special Offers

Reward examples:

₹100 OFF Electrical Purchase
900 points

₹250 OFF Electrical Purchase
2,000 points

Free 9W LED Bulb
750 points

Free Modular Switch
1,000 points

10% OFF Electrical Accessories
1,500 points

₹500 OFF Purchase
4,000 points

---

# 24. REWARD DETAIL

Show:

Reward image/icon
Reward title
Description
Required points
Current balance
Expiry
Terms
Availability

CTA:

"Redeem for 900 points"

If customer doesn't have enough points:

"250 more points needed"

Secondary:

"How to earn more"

---

# 25. REWARD REDEMPTION

Frontend simulation.

Customer clicks:

Redeem

Confirmation modal:

Current points

2,450

Reward cost

900

Remaining

1,550

Confirm.

Then:

Success animation.

"Reward unlocked 🎉"

Show:

₹100 OFF Electrical Purchase

Code:

AE-RW-8K4P2

Buttons:

Copy Code

Show QR

Done

Update local state.

Points decrease.

Activity updates.

---

# 26. CUSTOMER ACTIVITY

Show:

Purchase at Ambika Electricals
+125 points

Weekend Electrical Bonus
+250 points

Redeemed ₹100 Coupon
−900 points

Purchase — LED Bulbs
+120 points

Filters:

All
Earned
Redeemed
Bonus

Search.

Date filtering.

---

# 27. CUSTOMER CHALLENGES

Examples:

## Lighting Upgrade

Purchase 5 lighting products this month.

Progress:

3 / 5

Reward:

300 points

## Electrical Shopper

Make 3 purchases this month.

Progress:

2 / 3

Reward:

500 points

## Power Saver

Purchase qualifying LED products.

Reward:

250 points

Use clean gamification.

No childish visuals.

---

# 28. CUSTOMER REFERRALS

Page:

/customer/referrals

Heading:

"Invite friends. Earn rewards."

Referral code:

RAHUL25

Show:

Friends invited
Successful referrals
Points earned

Buttons:

Copy Code
Share
WhatsApp

Use mock sharing behavior.

---

# 29. CUSTOMER PROFILE

Show:

Personal details
Membership
Preferences
Notifications
Security
Help

Information:

Name
Phone
Email
Birthday
Member since

Edit profile through a modal.

Changes should update local state.

---

# 30. CUSTOMER NOTIFICATIONS

Examples:

"Your purchase earned 125 points."

"You're only 550 points away from Platinum."

"Your ₹100 electrical discount reward is ready."

"Weekend 2X Points is active."

"Your reward expires in 3 days."

Allow:

Mark as read

Mark all as read

Clear

---

# 31. BUSINESS APP

Business routes:

/business/dashboard
/business/sales
/business/sales/new
/business/customers
/business/products
/business/rewards
/business/rules
/business/campaigns
/business/challenges
/business/analytics
/business/stores
/business/staff
/business/settings

---

# 32. BUSINESS SHELL

Desktop:

Left sidebar.

Logo:

Ambika Electricals

Navigation.

Topbar:

Search
Notifications
Help
Profile

Mobile:

Compact header.

Bottom navigation:

Dashboard
Sales
Customers
More

Primary action:

New Sale

---

# 33. BUSINESS DASHBOARD

Route:

/business/dashboard

Greeting:

"Good morning 👋"

"Ambika Electricals"

KPIs:

Today's Sales
Monthly Revenue
Customers
Repeat Customers
Points Issued
Points Redeemed

Example demo values:

Today's Sales:
₹38,450

Monthly Revenue:
₹4,82,500

Customers:
2,840

Repeat Rate:
68.4%

Points Issued:
42,850

Points Redeemed:
18,240

---

# 34. BUSINESS ANALYTICS

Charts:

Revenue over time

Customer growth

Points issued vs redeemed

Top electrical product categories

Reward redemptions

Repeat customer rate

Use Recharts.

Date filters:

Today
7 days
30 days
90 days
This year
Custom

Changing date range must update mock data.

---

# 35. TOP PRODUCTS

Show electrical products.

Example:

1. 9W LED Bulb
2. Modular Switch
3. 16A Socket
4. Ceiling Fan
5. MCB 32A
6. House Wire
7. LED Tube Light

Show:

Sales
Revenue
Units
Points generated

---

# 36. TOP REWARDS

Show:

₹100 OFF Electrical Purchase

Free 9W LED Bulb

10% OFF Accessories

Free Modular Switch

₹250 OFF Electrical Purchase

Metrics:

Redemptions
Customers
Points consumed

---

# 37. SALES PAGE

Route:

/business/sales

Show sales history.

Desktop table:

Invoice
Customer
Products
Amount
Points
Store
Date
Status

Mobile:

Use card layout.

Filters:

Date
Store
Customer
Amount

Search invoice/customer.

---

# 38. CREATE SALE

Route:

/business/sales/new

This is one of the MOST IMPORTANT screens.

Create a premium POS-style interface.

Flow:

STEP 1

Select customer

STEP 2

Add electrical products

STEP 3

Review cart

STEP 4

Show reward calculation

STEP 5

Complete sale

---

# 39. CUSTOMER IDENTIFICATION

Two options:

PRIMARY:

"Scan Customer QR"

SECONDARY:

"Select Customer"

QR button opens scanner UI.

Scanner UI:

Camera-style visual frame

"Position customer QR inside the frame"

Mock scanning animation.

Then simulate successful scan.

Show:

"Customer found"

Rahul Sharma

Gold

2,450 points

Continue.

---

# 40. CUSTOMER SEARCH

Search by:

Name
Phone
Membership ID

Example:

Rahul Sharma
AE-10248
2,450 points
Gold

Click customer.

Customer becomes selected.

---

# 41. PRODUCT SELECTOR

Electrical categories:

Lighting
Switches & Sockets
Wires & Cables
Protection
Distribution
Fans
Accessories

Product cards should show:

Product
Brand
Price
Stock
Points

Example:

9W LED Bulb

Philips

₹120

+12 points

---

# 42. SALES CART

Cart should show:

Product
Quantity
Price
Points

Example:

9W LED Bulb × 10

₹1,200

120 points

Modular Switch × 4

₹480

48 points

Subtotal:

₹1,680

Estimated points:

168

---

# 43. LIVE POINT CALCULATION

As cart changes:

Update:

Subtotal
Discount
Final amount
Base points
Bonus points
Total points

Example:

Subtotal:

₹2,450

Base points:

245

Weekend bonus:

+245

Product bonus:

+50

Total:

540 points

Make this visually clear.

---

# 44. COMPLETE SALE

CTA:

"Complete Sale"

Confirmation modal:

Customer
Products
Amount
Points earned

Button:

Confirm Sale

Then success state:

"Sale completed 🎉"

"540 points added"

Show invoice number:

AE-INV-10482

Buttons:

New Sale

View Customer

Update local mock data.

---

# 45. PRODUCT MANAGEMENT

Route:

/business/products

Create professional product management.

Views:

Table
Grid

Search.

Filters:

Category
Brand
Stock
Status

Categories:

Lighting
Switches & Sockets
Wires & Cables
Protection
Distribution
Fans
Accessories

---

# 46. PRODUCT DATA EXAMPLE

Use realistic products:

Philips 9W LED Bulb
₹120

Philips 12W LED Bulb
₹165

Havells 10W LED Bulb
₹180

Anchor Modular Switch
₹85

Anchor 16A Socket
₹145

Legrand 16A Socket
₹220

Polycab 1.5 sq mm Wire
₹1,450

Finolex 2.5 sq mm Wire
₹2,250

Schneider 32A MCB
₹380

Havells 32A MCB
₹420

Crompton Ceiling Fan
₹2,450

Orient Exhaust Fan
₹1,850

PVC Conduit 20mm
₹45

Bulb Holder
₹35

Cable Gland
₹25

Electrical Tape
₹30

Use varied realistic inventory values.

---

# 47. CREATE PRODUCT

Fields:

Product name
Brand
SKU
Category
Price
MRP
Unit
Stock
Reward points
Image
Status

Use:

React Hook Form

Zod validation

Submit updates mock product state.

Show toast:

"Product added successfully."

---

# 48. CUSTOMER MANAGEMENT

Route:

/business/customers

CRM-style interface.

Show:

Customer
Tier
Points
Lifetime Spend
Purchases
Last Purchase

Filters:

Bronze
Silver
Gold
Platinum

Activity:

Active
Inactive

Search.

---

# 49. CUSTOMER DETAIL

Show:

Rahul Sharma

Gold

2,450 points

Stats:

Lifetime spend
Purchases
Average order
Last purchase
Lifetime points
Redeemed points

Tabs:

Overview
Purchases
Points
Rewards
Referrals
Notes

Purchase examples must be electrical.

---

# 50. REWARD MANAGEMENT

Route:

/business/rewards

Show rewards.

Examples:

₹100 OFF Electrical Purchase
900 points

₹250 OFF Electrical Purchase
2,000 points

Free 9W LED Bulb
750 points

Free Modular Switch
1,000 points

10% OFF Electrical Accessories
1,500 points

Free LED Tube Light
2,500 points

---

# 51. CREATE REWARD

Fields:

Reward name
Description
Reward type
Points required
Expiry
Inventory
Minimum purchase
Applicable tier
Status

Types:

Discount
Coupon
Free Electrical Product
Gift
Special Offer

Desktop:

Form left

Live reward preview right

Mobile:

Form then preview

---

# 52. REWARD RULES

Route:

/business/rules

Create a visual rule builder.

Example:

WHEN

Customer purchases

₹100

THEN

Award

10 points

Also support:

Product based

Category based

Multiplier

Signup bonus

First purchase

Referral

Birthday

Campaign bonus

---

# 53. ELECTRICAL-SPECIFIC RULE EXAMPLES

Example 1:

Every ₹100 spent = 10 points

Example 2:

Buy any LED product = +20 bonus points

Example 3:

Buy 5 or more LED bulbs = +100 points

Example 4:

Purchase from Wires & Cables = 2x points

Example 5:

Weekend electrical shopping = 2x points

Example 6:

First purchase = 250 bonus points

These are mock rules.

---

# 54. CAMPAIGNS

Route:

/business/campaigns

Create electrical-retail campaigns.

Examples:

"Weekend Power Bonus"

"LED Upgrade Week"

"Festival Electrical Savings"

"Customer Comeback"

"Fan Season Bonus"

"Home Wiring Bonus"

Campaign cards show:

Status
Audience
Duration
Reward
Performance

---

# 55. CAMPAIGN CREATOR

Multi-step wizard:

Step 1:
Campaign details

Step 2:
Audience

Step 3:
Reward

Step 4:
Schedule

Step 5:
Review

Audience:

All customers

New customers

Inactive customers

Gold customers

Platinum customers

High spenders

Customers who bought lighting products

Customers who bought wires/cables

---

# 56. AI CAMPAIGN ASSISTANT — FRONTEND ONLY

Add:

"Create with AI"

Click opens AI assistant panel.

Example input:

"Bring customers who haven't purchased electrical products in 60 days back to the store."

Mock AI response:

Campaign:

Electrical Comeback Weekend

Audience:

Customers inactive for 60+ days

Offer:

2X points

Duration:

Friday–Sunday

Suggested message:

"We've missed you! Visit Ambika Electricals this weekend and earn 2X reward points on your next electrical purchase."

Buttons:

Use Campaign

Edit

Regenerate

This is mock behavior only.

Do not connect to real AI yet.

---

# 57. CHALLENGES

Business can create challenges.

Electrical-specific examples:

"Lighting Upgrade"

Buy 5 LED products

Reward:

300 points

"Smart Shopper"

Purchase from 3 electrical categories

Reward:

500 points

"Monthly Electrical Buyer"

Make 3 purchases this month

Reward:

600 points

---

# 58. ANALYTICS

Route:

/business/analytics

Tabs:

Overview
Sales
Customers
Products
Rewards
Campaigns

Show:

Revenue

Repeat customers

Average order value

Reward redemption rate

Points issued

Points redeemed

Top electrical categories

Top products

Customer tier distribution

---

# 59. STORE MANAGEMENT

Stores:

Ambika Electricals — Main Store

Ambika Electricals — City Branch

Show:

Sales
Customers
Revenue
Points issued

Create store modal.

---

# 60. STAFF MANAGEMENT

Roles:

Owner
Manager
Cashier
Marketing

Show:

Name
Role
Store
Status
Last active

Create invite modal.

Frontend only.

---

# 61. SETTINGS

Settings:

Business Profile

Branding

Reward Program

Points Rules

Loyalty Tiers

Stores

Staff

Notifications

Preferences

---

# 62. COMMAND PALETTE

Implement:

Cmd/Ctrl + K

Search:

Customers

Products

Sales

Rewards

Pages

Example:

Search:

"LED"

Results:

9W LED Bulb

12W LED Bulb

LED Tube Light

Search:

"Rahul"

Result:

Rahul Sharma

---

# 63. MOBILE CUSTOMER EXPERIENCE

At 390px width, the customer application must feel like a native mobile app.

Use:

bottom navigation

large points balance

thumb-friendly buttons

bottom sheets

sticky CTAs where appropriate

swipe-friendly cards

Do not make the user zoom.

---

# 64. MOBILE BUSINESS EXPERIENCE

At 390px:

Dashboard
Sales
Customers
More

New Sale should be easily accessible.

Create a mobile POS flow.

Bottom sticky summary:

₹1,680

168 points

Complete Sale

---

# 65. RESPONSIVE BREAKPOINTS

Test:

360px
375px
390px
414px
430px
768px
1024px
1280px
1440px
1920px

No important content should break.

---

# 66. DARK MODE

Support:

Light
Dark
System

Dark mode should be intentionally designed.

Do not simply invert colors.

---

# 67. ANIMATIONS

Use Motion selectively.

Animations:

page transitions

modal entrance

reward redemption

points update

tier upgrade

sale success

button feedback

chart entrance

toast entrance

Respect:

prefers-reduced-motion

Keep animations fast and premium.

---

# 68. TOASTS

Never use browser alert().

Use polished toast notifications.

Examples:

"Sale completed."

"540 points added."

"Reward redeemed."

"Product added."

"Reward created."

"Customer updated."

"Copied to clipboard."

---

# 69. EMPTY STATES

Examples:

No customers:

"Your loyalty community starts here."

CTA:

"Add customer"

No products:

"Add your first electrical product."

No rewards:

"Create your first reward."

No sales:

"Your sales activity will appear here."

---

# 70. LOADING STATES

Use skeleton loaders.

Skeleton should resemble final content.

Avoid unnecessary spinners.

---

# 71. ERROR STATES

Use friendly error messages.

Example:

"Something didn't load."

"Try again"

Never expose technical stack/database errors.

---

# 72. ACCESSIBILITY

Implement:

semantic HTML

keyboard navigation

visible focus

accessible dialogs

form labels

ARIA where appropriate

good contrast

screen reader support

Minimum touch target:

approximately 44px.

---

# 73. FORMS

Use:

React Hook Form

Zod

All forms should have:

validation

inline errors

disabled submit

loading state

success state

---

# 74. MOCK STATE BEHAVIOR

Important:

The application must actually react to frontend actions.

Example:

CUSTOMER REDEEMS REWARD

Before:

2,450 points

After:

1,550 points

Activity:

new redemption appears

Notification:

reward unlocked

BUSINESS CREATES SALE

Before:

customer has 2,450 points

Sale:

₹2,450

Points:

245

After:

customer has 2,695 points

Sales:

new sale appears

Dashboard:

revenue updates

Points issued:

updates

Recent activity:

updates

This is frontend state only.

---

# 75. DEMO DATA — SALES

Create realistic electrical sales.

Example:

Invoice:

AE-INV-10482

Customer:

Rahul Sharma

Products:

10 × Philips 9W LED Bulb

4 × Anchor Modular Switch

1 × Schneider 32A MCB

Amount:

₹2,480

Points:

248

Other invoices should include:

* LED bulbs
* switches
* sockets
* wires
* MCB
* fans
* conduits
* electrical accessories

Never create food/restaurant/electronics-gadget sales.

---

# 76. DEMO DATA — POINT TRANSACTIONS

Examples:

Purchase — LED Bulbs

+120

Purchase — Modular Switches

+48

Weekend Power Bonus

+250

First Purchase Bonus

+250

Reward Redemption

−900

Birthday Bonus

+500

---

# 77. DEMO DATA — REWARDS

Use:

₹100 OFF Electrical Purchase
900 points

₹250 OFF Electrical Purchase
2,000 points

Free 9W LED Bulb
750 points

Free Modular Switch
1,000 points

10% OFF Electrical Accessories
1,500 points

Free LED Tube Light
2,500 points

₹500 OFF Electrical Purchase
4,000 points

---

# 78. DEMO DATA — CAMPAIGNS

Use:

Weekend Power Bonus
Active

LED Upgrade Week
Active

Festival Electrical Savings
Scheduled

Customer Comeback
Draft

Fan Season Bonus
Scheduled

---

# 79. DEMO DATA — CHALLENGES

Use:

Lighting Upgrade

Smart Electrical Shopper

Monthly Electrical Buyer

Weekend Power Shopper

---

# 80. CUSTOMER HOME PERSONALIZATION

Customer dashboard should dynamically use:

Rahul Sharma

Ambika Electricals

2,450 points

Gold

550 points to Platinum

Show relevant electrical rewards.

---

# 81. BUSINESS DASHBOARD PERSONALIZATION

Show:

Good morning

Ambika Electricals

Main Store

Current sales

Electrical product performance

Reward performance

Customer loyalty insights

---

# 82. GLOBAL SEARCH

Business global search should search mock data across:

customers
products
sales
rewards

Customer search should search:

rewards
activity
challenges

---

# 83. FILTER EXPERIENCE

Desktop:

Inline filters.

Mobile:

Filter button.

Click:

Bottom sheet.

Show:

Active filters

Apply

Clear all

---

# 84. TABLE RESPONSIVENESS

Desktop:

Professional data table.

Mobile:

Convert rows to cards.

Do not force important tables into tiny unreadable text.

---

# 85. DESIGN SYSTEM

Create reusable components:

AppShell
Sidebar
MobileNav
Topbar
PageHeader
StatCard
PointsCard
RewardCard
ProductCard
ProductSelector
CustomerSelector
CustomerCard
TierBadge
StatusBadge
DataTable
MobileList
EmptyState
LoadingSkeleton
ConfirmDialog
BottomSheet
QRCodeCard
QRScanner
ChartCard
FilterBar
SearchInput
CommandPalette
Toast
NotificationCenter
SaleCart
PointsPreview
SuccessState

Do not duplicate components.

---

# 86. ICON SYSTEM

Use Lucide icons.

Suggested:

Zap
BadgePercent
Gift
ShoppingCart
Users
BarChart3
Package
CreditCard
QrCode
ScanLine
Trophy
Star
Sparkles
Settings
Store
UserRound
Bell
Search
Plus
ArrowUp
ArrowDown

Use icons consistently.

---

# 87. MICROCOPY

Use simple human language.

Examples:

"Show QR"

"Create Sale"

"Add Product"

"Earned 245 points"

"Reward unlocked"

"550 points to Platinum"

"Nothing here yet"

"Create your first reward"

Avoid robotic copy.

---

# 88. CUSTOMER EMOTIONAL EXPERIENCE

The customer should feel:

"I am getting value from shopping at Ambika Electricals."

Use rewarding but professional language.

Examples:

"You're getting closer to Platinum."

"Nice! You earned 245 points."

"Your next reward is within reach."

---

# 89. BUSINESS EMOTIONAL EXPERIENCE

Owner should feel:

"I understand my customers and can increase repeat purchases."

Focus dashboard on:

Revenue

Customers

Repeat purchases

Rewards

Campaign performance

Not just vanity metrics.

---

# 90. PWA PREPARATION

Prepare frontend for PWA.

Include:

* manifest-ready structure
* mobile viewport
* app-like navigation
* safe area support
* installable architecture

No complex offline transactions.

---

# 91. SEO

Marketing pages should have:

metadata

OpenGraph

semantic HTML

fast loading

Authenticated dashboard pages don't require public SEO.

---

# 92. PERFORMANCE

Use:

optimized images

lazy loading where appropriate

efficient lists

pagination UI

code splitting where appropriate

Do not load huge datasets unnecessarily.

---

# 93. DEVELOPMENT DEMO SWITCHER

Create a development-only/demo switcher.

Options:

Customer — Rahul Sharma

Business Owner — Ambika Electricals

Staff — Cashier Demo

This makes it easy to demonstrate the complete product.

Do not treat this as production authentication.

---

# 94. FRONTEND SERVICE ABSTRACTION

Create mock service functions.

Example:

customerService.getProfile()

customerService.getPoints()

rewardService.getRewards()

rewardService.redeemReward()

salesService.createSale()

productService.getProducts()

analyticsService.getDashboard()

campaignService.createCampaign()

Phase 2 can later replace implementations without rewriting the UI.

---

# 95. NO BACKEND

Again:

DO NOT implement:

Supabase

PostgreSQL

RLS

real authentication

real API

real payment

real QR verification

real notification providers

The only data layer in this phase is mock/local frontend data.

---

# 96. VISUAL QUALITY CHECK

Before considering any screen finished, check:

Does it look premium?

Does it look professional enough for a real electrical business?

Does it work at 390px?

Does it work at 1440px?

Is the main CTA obvious?

Are points easy to understand?

Are rupee amounts easy to read?

Are electrical products visually clear?

Are empty states polished?

Are hover/focus states polished?

Are modals polished?

Are animations subtle?

---

# 97. CRITICAL FLOWS TO TEST

## FLOW 1 — CUSTOMER REWARD

Customer dashboard

→ Rewards

→ Open reward

→ Redeem

→ Confirmation

→ Success

→ Points decrease

→ Activity updates

→ Notification updates

---

## FLOW 2 — QR SALE

Business dashboard

→ New Sale

→ Scan Customer QR

→ Mock scan success

→ Rahul Sharma selected

→ Add LED Bulb

→ Add Modular Switch

→ Add MCB

→ Points calculate

→ Complete Sale

→ Success

→ Customer points increase

→ Sales list updates

→ Dashboard stats update

---

## FLOW 3 — PRODUCT

Products

→ Add Product

→ Form validation

→ Save

→ Product appears

---

## FLOW 4 — REWARD

Rewards

→ Create Reward

→ Form

→ Preview

→ Save

→ Reward appears

---

## FLOW 5 — CAMPAIGN

Campaigns

→ Create Campaign

→ Multi-step wizard

→ Audience

→ Reward

→ Schedule

→ Review

→ Create

→ Campaign appears

---

## FLOW 6 — RESPONSIVE

Test every major flow at:

390px

768px

1440px

---

# 98. FINAL APPLICATION FEEL

The final product should feel like:

A premium loyalty application built specifically for a modern electrical retailer.

It should NOT feel like:

* generic admin dashboard
* restaurant loyalty app
* ecommerce template
* AI-generated toy project
* Bootstrap template
* static mockup

The visual relationship should be:

AMBIKA ELECTRICALS
+
LOYALTY
+
REWARDS
+
CUSTOMER ENGAGEMENT
+
MODERN RETAIL

---

# 99. FINAL IMPLEMENTATION INSTRUCTION

Do not merely create a few screens.

Build the complete Phase 1 frontend experience.

Start with:

1. Design system
2. Brand
3. Application shell
4. Customer experience
5. Business experience
6. Product management
7. Sales/POS flow
8. QR customer identification UI
9. Points interaction
10. Rewards
11. Redemption
12. Customers
13. Campaigns
14. Challenges
15. Analytics
16. Staff
17. Stores
18. Settings
19. Demo mode
20. Responsive polish

Keep the entire project runnable throughout development.

Use realistic electrical retail data everywhere.

Use **Ambika Electricals** everywhere.

Every product must be electrical-related.

Every sales example must be electrical-related.

Every reward should be relevant to an electrical retail business.

Prioritize:

1. UI/UX quality
2. Mobile experience
3. Desktop experience
4. Realistic interactions
5. Visual polish
6. Clean architecture
7. Accessibility
8. Performance

Do NOT move to backend implementation.

This is **PHASE 1 — FRONTEND UI/UX ONLY**.

START BUILDING NOW.


---

# SOURCE SPECIFICATION: PHASE 1.1

# REWARDLY / AMBIKA ELECTRICALS

# PHASE 1.1 — UI/UX FINALIZATION & CUSTOMER REDEMPTION EXPERIENCE

You are continuing an existing frontend-only project for:

# AMBIKA ELECTRICALS

This project is a premium customer loyalty and rewards platform.

IMPORTANT:

This is STILL PHASE 1.

Do NOT implement backend.

Do NOT implement Supabase.

Do NOT implement PostgreSQL.

Do NOT implement real authentication.

Do NOT implement real payments.

Do NOT implement real QR verification.

Use mock/local frontend state and realistic demo data.

Your job in this phase is to **extend and polish the existing Phase 1 frontend**.

DO NOT rebuild the entire application from scratch if the existing components already work.

Reuse existing components and design system.

---

# 1. MAIN GOAL OF THIS PHASE

Finalize the customer redemption experience and authentication UI.

Add:

1. Login
2. Create Account
3. Forgot Password
4. Account verification UI
5. Customer onboarding
6. Product-based reward redemption
7. Points + cash purchase options
8. Multiple redemption methods
9. Reward/product detail experience
10. Cart experience
11. Redemption checkout
12. Redemption confirmation
13. Redemption history
14. Better customer rewards experience
15. Final UX polish

Everything must remain responsive on:

Mobile
Tablet
Desktop

---

# 2. IMPORTANT PRODUCT CONCEPT

Do NOT think of "Rewards" as only coupons.

The Rewardly customer experience should have a:

# REWARDS STORE

The customer can use their loyalty points to get:

* electrical products
* discounts
* coupons
* special offers
* free products
* points + cash deals
* exclusive member pricing

The customer should be able to browse electrical products and decide how to use their points.

---

# 3. CUSTOMER REWARDS STORE

Route:

/customer/rewards

Create a premium ecommerce-style rewards experience.

Header:

"Rewards Store"

Subheading:

"Use your points on products, discounts and exclusive member offers."

At the top show:

2,450 Points

Worth approximately:

₹245

---

# 4. REWARD STORE CATEGORIES

Create tabs/categories:

All

Electrical Products

Lighting

Switches & Sockets

Wires & Cables

Fans

Protection

Accessories

Discounts

Coupons

Special Offers

Use horizontal scrolling tabs on mobile.

Desktop can use category navigation.

---

# 5. PRODUCT REWARD CARDS

Every product card should clearly show:

Product image

Product name

Brand

Regular price

Points price

Optional points + cash price

Stock/availability

Tier eligibility if applicable

Example:

## Philips 9W LED Bulb

Regular Price:

₹120

Reward Price:

750 Points

OR

500 Points + ₹40

CTA:

"View"

---

# 6. IMPORTANT — PRODUCT REDEMPTION

The customer should be able to select a product and redeem it using points.

Example:

Customer has:

2,450 points

Product:

Philips 9W LED Bulb

Options:

### OPTION A

Redeem with points

750 Points

Customer pays:

₹0

---

### OPTION B

Points + Cash

500 Points

* ₹40

---

### OPTION C

Member Discount

₹120 normal

₹99 Gold Member Price

---

Do not assume every product must support every option.

The UI should support configurable redemption types.

For demo data, different products can have different options.

---

# 7. PRODUCT DETAIL PAGE

Route:

/customer/rewards/[id]

Create a premium product detail experience.

Show:

Large product image

Product name

Brand

Category

Short description

Regular price

Member price

Points price

Points + cash option

Availability

Reward eligibility

Terms

Quantity

CTA

---

# 8. PRODUCT DETAIL EXAMPLE

Use:

Philips 9W LED Bulb

Category:

Lighting

Regular price:

₹120

Gold Member price:

₹99

Reward price:

750 points

Points + cash:

500 points + ₹40

Description:

"Energy-efficient LED bulb suitable for everyday home and commercial lighting."

Show:

✓ Gold members eligible

✓ In stock

✓ 7-day redemption validity

---

# 9. OTHER ELECTRICAL REWARD PRODUCTS

Use realistic electrical products.

Examples:

Philips 9W LED Bulb

750 points

Philips 12W LED Bulb

950 points

Anchor Modular Switch

850 points

Anchor 16A Socket

1,200 points

LED Tube Light

1,800 points

Bulb Holder

300 points

Electrical Extension Board

1,500 points

Electrical Tape Pack

250 points

PVC Conduit Pack

700 points

Cable Tie Pack

350 points

Fan Regulator

1,100 points

Smart LED Bulb

2,500 points

Do not use unrelated products.

---

# 10. PRODUCT IMAGES

Use electrical-product imagery.

If external images are unavailable, use elegant product placeholders that clearly represent the product.

Do NOT use:

food

clothing

restaurant images

generic random products

Use consistent image ratios.

---

# 11. REDEMPTION OPTIONS

When customer clicks:

"Redeem"

show a clean selection interface.

Heading:

"How would you like to use your points?"

Options:

## 1. Redeem with Points

Use only points.

Example:

750 points

Pay ₹0

---

## 2. Points + Cash

Use fewer points and pay the remaining amount.

Example:

500 points + ₹40

---

## 3. Member Price

Use your membership benefit.

Example:

₹120 → ₹99

---

## 4. Coupon / Discount

For eligible rewards.

Example:

₹100 OFF on next electrical purchase

900 points

---

## 5. Save for Later

Customer can add reward/product to wishlist.

---

Do not show irrelevant options for products that don't support them.

---

# 12. REDEMPTION OPTION SELECTOR

Create a beautiful card-based selector.

Each option should show:

Icon

Title

Description

Cost

Savings

Radio/check state

Example:

○ Redeem with Points

750 Points

Save ₹120

○ Points + Cash

500 Points + ₹40

Save ₹80

○ Gold Member Price

₹99

Save ₹21

Selected option should have clear visual feedback.

---

# 13. INSUFFICIENT POINTS EXPERIENCE

If customer has insufficient points:

Example:

Product requires:

2,500 points

Customer has:

2,450 points

Show:

"You're only 50 points away."

CTA:

"See Ways to Earn"

Other option:

"Use Points + Cash"

If supported.

Do not simply disable everything without explanation.

---

# 14. WAYS TO EARN MORE

Create a bottom sheet/page:

"Earn more points"

Show:

Purchase electrical products

+10 points per ₹100

Weekend Bonus

2X points

Refer a friend

+200 points

Buy LED products

+50 bonus points

Complete challenge

+300 points

CTA:

"Start Earning"

---

# 15. PRODUCT QUANTITY

For products that support multiple units:

Quantity:

− 1 +

Show dynamic calculation.

Example:

1 × LED Bulb

750 points

2 × LED Bulbs

1,500 points

If the reward has a redemption limit, show it.

---

# 16. REDEMPTION CART

Create a mini cart/reward basket.

Route:

/customer/rewards/cart

Show selected products.

Example:

Philips 9W LED Bulb × 2

1,500 points

Anchor Modular Switch × 1

850 points

Total:

2,350 points

Balance after redemption:

100 points

If points + cash:

Total points:

1,800

Cash:

₹80

---

# 17. CART VALIDATION

Before checkout:

Check mock local state.

Show:

Current points

Required points

Remaining points

Cash payable

If insufficient:

Show clear error.

Do not allow invalid checkout.

---

# 18. REDEMPTION CHECKOUT

Route:

/customer/rewards/checkout

Show:

Order summary

Selected rewards/products

Redemption method

Points used

Cash payable if applicable

Customer details

Pickup/delivery choice

---

# 19. PICKUP / DELIVERY OPTIONS

For the frontend prototype, provide:

### Store Pickup

"Collect from Ambika Electricals"

Show store:

Ambika Electricals — Main Store

Address:

Use realistic demo address.

Estimated:

"Ready for pickup after confirmation"

---

### Delivery

Show:

"Delivery available"

Use mock delivery information.

Customer can choose:

Pickup

or

Delivery

Do NOT implement real delivery integration.

---

# 20. CUSTOMER ADDRESS UI

If delivery is selected:

Show address form.

Fields:

Full Name

Phone

Address

Area

City

State

Pincode

Use:

React Hook Form

Zod

Frontend validation only.

Save address in local mock state.

---

# 21. CHECKOUT SUMMARY

Create a premium summary card.

Example:

## Redemption Summary

Products:

2 × Philips 9W LED Bulb

Points used:

1,500

Cash:

₹0

Delivery:

Store Pickup

Total:

1,500 Points

CTA:

"Confirm Redemption"

---

# 22. REDEMPTION CONFIRMATION

After confirming:

Show premium success screen.

Animation:

subtle celebration / spark

Heading:

"Reward unlocked 🎉"

Show:

Redemption ID

AE-RWD-10842

Product

Philips 9W LED Bulb

Points used

750

Status

Ready for pickup

Generate a mock redemption code:

AE-8K4P2

---

# 23. DIGITAL REDEMPTION PASS

Create a digital reward pass.

Show:

Ambika Electricals

Reward/Product

Customer name

Redemption ID

QR code

Redemption code

Expiry

Status

Button:

"Show QR"

Button:

"Copy Code"

Button:

"View Details"

This is mock QR only.

---

# 24. REDEMPTION HISTORY

Add to:

/customer/activity

or create:

/customer/redemptions

Show:

Active

Completed

Expired

Cancelled

Example:

Philips 9W LED Bulb

750 points

Redeemed Sep 4

Ready for Pickup

Redemption ID:

AE-RWD-10842

---

# 25. REDEMPTION STATUS

Use statuses:

Pending

Confirmed

Ready for Pickup

Completed

Expired

Cancelled

Each status gets an appropriate badge.

---

# 26. REWARD DETAIL TERMS

Every redeemable product/reward should have:

Terms & Conditions

Examples:

* Available for Gold members
* Maximum 2 redemptions per month
* Subject to availability
* Valid for 7 days
* Store pickup available
* Cannot be exchanged for cash

Display terms elegantly in an expandable section.

---

# 27. WISHLIST

Allow customer to:

Add to wishlist

Remove from wishlist

View wishlist

Route:

/customer/wishlist

Show electrical products.

Example:

"Save products you want to redeem later."

---

# 28. REWARD STORE FILTERS

Add:

Category

Points range

Availability

Reward type

Tier eligibility

Sort:

Recommended

Lowest points

Highest points

Newest

Popular

Mobile:

Filters open in bottom sheet.

---

# 29. SEARCH REWARDS

Search electrical products.

Examples:

"LED"

"Switch"

"MCB"

"Wire"

"Fan"

"Socket"

Show live mock search results.

Empty:

"No electrical rewards found."

Suggestion:

"Try LED, switch or socket."

---

# 30. PRODUCT COMPARISON

If practical, allow customers to compare up to 2–3 reward products.

Compare:

Price

Points

Brand

Category

Savings

Availability

Do not overcomplicate the mobile experience.

---

# 31. LOGIN PAGE

Add authentication UI.

Route:

/login

Design must be premium.

Desktop:

Split-screen layout.

Left:

Brand/product visual.

Right:

Login form.

Mobile:

Single elegant screen.

---

# 32. LOGIN BRANDING

Show:

Ambika Electricals

Powered by Rewardly

Headline:

"Welcome back."

Subheadline:

"Your rewards are waiting."

Form:

Mobile number or email

Password

CTA:

"Sign In"

Links:

Forgot password?

Create account

---

# 33. LOGIN OPTIONS

UI should support:

Email + Password

Phone + OTP

Google sign-in UI

Do not implement real authentication.

These are frontend mock interactions.

---

# 34. LOGIN INTERACTION

Email/password:

Enter values.

Validate.

Submit.

Show loading.

Then simulate success.

Redirect to customer dashboard.

For demo:

Allow test account behavior.

Example:

[rahul@demo.com](mailto:rahul@demo.com)

Password:

Demo@123

Do not present this as a real account.

---

# 35. OTP LOGIN

Create OTP interface.

Flow:

Enter phone

→ Continue

→ OTP screen

→ 6-digit input

→ Verify

→ Success

Use mock OTP:

123456

Show:

"Demo OTP: 123456"

Only in development/demo context.

---

# 36. FORGOT PASSWORD

Route:

/forgot-password

Show:

"Reset your password"

Enter:

Email or phone

CTA:

"Send Reset Link"

Then mock success:

"Check your inbox for reset instructions."

Button:

Back to Login

---

# 37. CREATE ACCOUNT

Route:

/signup

Heading:

"Create your Rewardly account."

Subheading:

"Join Ambika Electricals and start earning rewards."

Fields:

Full name

Mobile number

Email

Password

Confirm password

Optional:

Birthday

Checkbox:

I agree to Terms & Privacy Policy

CTA:

"Create Account"

---

# 38. SIGNUP VALIDATION

Use:

React Hook Form

Zod

Validate:

Name required

Valid phone

Valid email

Password strength

Passwords match

Terms accepted

Show inline errors.

---

# 39. PASSWORD UX

Password field should have:

Show/hide password

Password strength indicator

Requirements:

8+ characters

Uppercase

Number

Special character

Do not make password requirements unnecessarily complicated.

---

# 40. ACCOUNT CREATED SUCCESS

After mock signup:

Show:

"Welcome to Ambika Electricals 🎉"

"Your rewards journey starts now."

Give:

100 welcome points

Membership ID:

AE-NEW-10482

CTA:

"Explore Rewards"

---

# 41. ONBOARDING

After signup, create a short onboarding experience.

Step 1:

Welcome

Step 2:

Your points

Step 3:

How rewards work

Step 4:

Show QR

Step 5:

Explore rewards

Allow:

Skip

Continue

Keep onboarding short.

---

# 42. ONBOARDING DESIGN

Use premium illustrations or abstract electrical/reward visuals.

Do not use childish cartoon graphics.

Use subtle:

spark
coin
lightning
reward

visual language.

---

# 43. BUSINESS LOGIN

The same authentication UI should support:

Customer

Business Owner

Staff

At login, demo mode can allow selecting:

Customer Demo

Business Demo

Staff Demo

Do not expose this as a production authentication mechanism.

---

# 44. BUSINESS LOGIN SCREEN

Headline:

"Run your loyalty program smarter."

Subheadline:

"Manage customers, sales and rewards from one place."

Brand:

Ambika Electricals

CTA:

"Sign In"

Link:

"Create business account"

---

# 45. BUSINESS SIGNUP

Create:

/business/signup

Fields:

Business name

Owner name

Mobile

Email

Password

Business category

Default:

Electrical Retail

CTA:

"Create Business"

---

# 46. BUSINESS ONBOARDING

After signup:

Step 1:

Business details

Step 2:

Choose reward model

Step 3:

Create first rule

Step 4:

Create first reward

Step 5:

Add products

Step 6:

Launch loyalty program

Show progress.

---

# 47. REWARD PROGRAM SETUP

During onboarding show:

"How should customers earn points?"

Options:

Every ₹100 spent

Product based

Category based

Custom

Default:

₹100 = 10 points

Allow preview.

---

# 48. CUSTOMER LOGIN / BUSINESS LOGIN UX

Create a subtle way to switch:

"Customer Login"

"Business Login"

Do not clutter the page.

Use tabs or a small contextual link.

---

# 49. AUTH PAGE RESPONSIVENESS

At mobile:

No unnecessary split screen.

Focus on:

Logo

Headline

Form

CTA

Support links

At desktop:

Beautiful split-screen composition.

Left visual panel:

Ambika Electricals loyalty experience.

Right:

Authentication card.

---

# 50. AUTH VISUAL

Create an abstract visual showing:

electrical spark

reward coin

points

product card

QR

Do not use random stock imagery.

---

# 51. SESSION UI

Add:

Loading authentication state.

Example:

"Signing you in..."

Success:

"Welcome back!"

Error:

"Email or password doesn't look right."

---

# 52. ACCOUNT MENU

Customer profile menu:

Profile

Membership

Points

Redemptions

Notifications

Settings

Sign out

Business:

Profile

Business Settings

Staff

Stores

Help

Sign out

---

# 53. SIGN OUT

Use confirmation only if appropriate.

"Sign out of Rewardly?"

Cancel

Sign out

Then redirect to login.

Mock only.

---

# 54. CUSTOMER REWARD HOME

Improve customer dashboard with a dedicated reward discovery section.

Heading:

"Rewards picked for you"

Cards:

Free LED Bulb

₹100 OFF

Modular Switch

10% OFF Accessories

Add:

"View all"

---

# 55. PERSONALIZED REWARD LABELS

Use labels:

Best for you

Popular

Almost unlocked

Limited

New

Member Exclusive

Do not use all labels everywhere.

---

# 56. POINTS VALUE EXPLANATION

Make it clear that points have configurable value.

Example:

"2,450 points"

"Approx. ₹245 reward value"

Small info tooltip:

"Reward value depends on the offer."

---

# 57. REDEMPTION UX PRINCIPLE

At every redemption step the customer must understand:

What am I getting?

How many points will I spend?

Do I need to pay cash?

What will remain?

Where will I receive it?

When will it expire?

Do not hide important information.

---

# 58. CHECKOUT UX

Use a simple step indicator:

1. Reward
2. Options
3. Details
4. Confirm

Mobile:

Compact progress indicator.

Desktop:

Horizontal stepper.

---

# 59. SUCCESS EXPERIENCE

After redemption:

Do NOT immediately dump the customer back to the dashboard.

Show a beautiful success state first.

Example:

"You're all set! 🎉"

"Your Philips 9W LED Bulb has been reserved."

Then:

Redemption Code

Pickup location

Expiry

Buttons:

View Redemption

Continue Shopping

---

# 60. CONTINUE SHOPPING

After redemption:

CTA:

"Continue Shopping"

Return to:

Rewards Store

Keep customer context.

---

# 61. BACK NAVIGATION

Ensure:

Browser back

in-app back

modal close

drawer close

all behave naturally.

Do not trap users.

---

# 62. CUSTOMER REWARDS STORE — DESKTOP

Desktop layout:

Header

Points balance

Category navigation

Filter sidebar

Product grid

Recommended rewards

Use:

3–4 product columns depending on screen width.

---

# 63. CUSTOMER REWARDS STORE — MOBILE

Mobile:

Header

Points balance

Search

Category carousel

Filter

Product grid:

2 columns

Reward cards should be compact but readable.

Sticky cart/reward basket when needed.

---

# 64. CART BADGE

When products are added:

Rewards cart icon shows:

1

2

3

Use animated count update.

---

# 65. REWARD CARD CTA

Depending on product:

"Redeem"

"View Reward"

"Almost There"

"Use Points + Cash"

"Member Price"

The CTA should communicate the action.

---

# 66. PRODUCT AVAILABILITY

Show:

In Stock

Low Stock

Out of Stock

If out of stock:

Disable redemption.

Show:

"Notify me"

For Phase 1, clicking Notify Me can show:

"You're on the notification list."

Mock only.

---

# 67. REDEMPTION LIMIT

If customer already redeemed maximum:

Show:

"Monthly limit reached"

"Available again next month"

Do not allow redemption.

---

# 68. TIER-SPECIFIC REWARDS

Some rewards can be:

Silver+

Gold Exclusive

Platinum Exclusive

Show a badge.

If user is not eligible:

"Unlock at Gold"

CTA:

"View Tier Benefits"

---

# 69. REWARD DETAIL SAVINGS

Show:

Regular Price

₹120

Your Price

750 points

Estimated Savings:

₹120

For points + cash:

Regular:

₹120

Your deal:

500 points + ₹40

Estimated savings:

₹80

Make savings visually clear but not overly promotional.

---

# 70. WISHLIST INTERACTION

Heart icon.

Click:

Add to wishlist

Animate subtly.

Second click:

Remove

Toast.

Wishlist persists in local state.

---

# 71. FINAL UI POLISH

After implementing all features, perform a complete visual pass.

Fix:

spacing

alignment

typography

icon sizes

button heights

border consistency

card consistency

mobile padding

desktop max-width

modal sizing

bottom-sheet behavior

empty states

loading states

error states

success states

hover states

focus states

---

# 72. NO GENERIC ECOMMERCE TEMPLATE

The Rewards Store must NOT feel like Amazon/Flipkart clone.

It is a:

LOYALTY REWARDS STORE

The visual emphasis should be:

Points

Savings

Membership

Rewards

Benefits

not only product prices.

---

# 73. ELECTRICAL BRAND EXPERIENCE

Throughout the rewards store, maintain:

Ambika Electricals

Electrical products

Reward points

Member pricing

Store pickup

Loyalty benefits

The entire experience should feel purpose-built for an electrical retailer.

---

# 74. FINAL DEMO CUSTOMER STATE

Use:

Rahul Sharma

2,450 points

Gold

550 points to Platinum

Wishlist:

Philips 12W LED Bulb

Smart LED Bulb

Rewards:

₹100 OFF Electrical Purchase

Free 9W LED Bulb

Member-exclusive products

---

# 75. FINAL DEMO REDEMPTION

Make sure the demo supports this complete flow:

Rahul opens:

Rewards Store

→ Lighting

→ Philips 9W LED Bulb

→ View Reward

→ Redeem

→ Select:

750 Points

→ Checkout

→ Store Pickup

→ Confirm

→ Success

→ Redemption Code

→ Points reduce from 2,450 to 1,700

→ Activity updates

→ Redemption appears in history

This flow MUST actually work in frontend state.

---

# 76. SECOND DEMO FLOW

Also support:

Rahul

2,450 points

→ Smart LED Bulb

→ Points + Cash

→ 2,000 points + ₹150

→ Checkout

→ Confirm

→ Success

→ Remaining points:

450

This demonstrates that different redemption methods can coexist.

---

# 77. THIRD DEMO FLOW

Customer does not have enough points.

Example:

Product:

Ceiling Fan

Reward:

8,000 points

Customer:

2,450 points

Show:

"5,550 more points needed."

Ways to earn:

Purchase
Bonus
Referral
Challenge

And if points + cash is available:

show it as an alternative.

---

# 78. BUSINESS SIDE REWARD CONFIGURATION PREVIEW

Even though backend is NOT being built, make the UI ready for future configuration.

Business reward creation should support:

Reward type:

Product

Discount

Coupon

Points + Cash

Member Price

Special Offer

This ensures Phase 2 can connect the real backend without redesigning the UI.

---

# 79. DO NOT IMPLEMENT BACKEND

Again:

NO DATABASE.

NO SUPABASE.

NO API.

NO REAL AUTH.

NO REAL PAYMENT.

NO REAL QR.

NO REAL NOTIFICATION.

Use mock data only.

---

# 80. FINAL DEFINITION OF DONE

Phase 1.1 is complete only when:

✓ Customer can see electrical rewards

✓ Customer can browse electrical products

✓ Customer can search products

✓ Customer can filter products

✓ Customer can view product details

✓ Customer can choose redemption method

✓ Customer can use points

✓ Customer can use points + cash

✓ Customer can use member pricing

✓ Customer can add reward products to cart

✓ Customer can checkout

✓ Customer can choose pickup/delivery UI

✓ Customer can see redemption success

✓ Customer receives mock redemption code

✓ Customer sees redemption history

✓ Customer can wishlist products

✓ Customer can see insufficient-points experience

✓ Customer can see ways to earn more points

✓ Customer can login

✓ Customer can create account

✓ Customer can use mock OTP flow

✓ Customer can reset password

✓ Customer can complete onboarding

✓ Business can login

✓ Business can create mock account

✓ Existing Phase 1 business dashboard remains functional

✓ Existing sales flow remains functional

✓ Existing QR scan flow remains functional

✓ Existing product management remains functional

✓ Existing reward management remains functional

✓ Existing campaign/challenge UI remains functional

✓ All mock data remains electrical-related

✓ All major screens work on mobile

✓ All major screens work on desktop

✓ Dark mode works

✓ Loading states exist

✓ Empty states exist

✓ Error states exist

✓ Success states exist

✓ Animations are polished

✓ Accessibility is maintained

---

# 81. FINAL INSTRUCTION

DO NOT rebuild the application unnecessarily.

Inspect the existing Phase 1 implementation first.

Reuse the existing design system and components.

Extend the existing application.

Keep the code clean and modular.

Do not introduce backend functionality.

Do not create fake APIs pretending to be production APIs.

Use local mock services/state.

The final frontend should feel like a **real commercial loyalty + rewards application for Ambika Electricals**, not a generic template.

The most important customer journey is:

LOGIN

→ CUSTOMER DASHBOARD

→ REWARDS STORE

→ ELECTRICAL PRODUCT

→ REDEMPTION OPTIONS

→ POINTS / POINTS + CASH / MEMBER PRICE

→ CART

→ CHECKOUT

→ CONFIRM

→ REWARD SUCCESS

→ REDEMPTION CODE

→ ACTIVITY

Make this experience exceptionally polished.

START IMPLEMENTING PHASE 1.1 NOW.


---

# FINAL AGENT CHECKLIST

Before handoff, verify the existing Phase 1 functionality remains operational and validate the primary sale flow plus every required customer redemption demo flow. Confirm that the Login and Create Account pages include the lightweight Three.js visual and that all critical interactions use modern shadcn/ui components with responsive, accessible motion.


