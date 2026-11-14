import { DEFAULT_CATEGORY_GROUPS, type CategoryGroupSeed } from "./defaultCategories";

/**
 * A way to start a new budget (#212): the category groups (and their
 * categories) it is seeded with, in display order — array position
 * becomes `sortOrder`. Static data; no schema involved.
 */
export interface BudgetTemplate {
  id: string;
  name: string;
  description: string;
  groups: readonly CategoryGroupSeed[];
}

/** What the new-budget form preselects. */
export const DEFAULT_TEMPLATE_ID = "beginner";

/**
 * What getCurrentBudget's first-visit fallback seeds: the owner's
 * household list, as every budget got before templates existed.
 */
export const FALLBACK_TEMPLATE_ID = "household";

/**
 * Every way a new budget can start, in picker order: Blank, the owner's
 * Household list, then templates transcribed from ynab.com/templates
 * (2026-11-14, all 39 listed there). Transcription notes:
 * - Each page's "Read Me!" group (a single "About This Template" note) is
 *   dropped; it explains the template on YNAB's site, it isn't a category.
 * - Template names are generic rather than YNAB's own, and category names
 *   that were one person's specifics (family members' names, card issuers,
 *   brands, the YNAB subscription itself) are made generic. Everything
 *   else is verbatim, emoji included, in page order.
 */
export const BUDGET_TEMPLATES: readonly BudgetTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "No categories — start from scratch.",
    groups: [],
  },
  {
    id: FALLBACK_TEMPLATE_ID,
    name: "Household (Hebrew)",
    description: "The household-budget categories every budget started with before templates.",
    groups: DEFAULT_CATEGORY_GROUPS,
  },
  {
    id: "beginner",
    name: "Beginner",
    description:
      "A comprehensive starting point: monthly bills, fun money, debt, kids, non-monthly costs, savings and a wish list.",
    groups: [
      {
        name: "Monthly",
        categories: [
          "🏠 Mortgage",
          "📱 Phone",
          "🎥 Streaming",
          "💧 Water",
          "💡 Electric",
          "🌐 Internet",
          "🎧 Music Streaming",
          "🛒 Groceries",
          "⛽ Gas",
        ],
      },
      {
        name: "Fun",
        categories: [
          "🚲 Your Spending Money",
          "🍭 My Spending Money",
          "🍔 Take-Out/Delivery",
          "💖 Dates",
          "🛋️ Home Decor",
        ],
      },
      {
        name: "Debt Paydown",
        categories: ["💳 Credit Card Payment", "💸 Credit Card Interest", "🚗 Car Loan"],
      },
      {
        name: "Kids",
        categories: ["🏊 Swim Lessons", "👶 Kid #1", "👧 Kid #2"],
      },
      {
        name: "Non-Monthly/Annual",
        categories: [
          "🛠️ Home Maintenance",
          "🔧 Auto Maintenance",
          "🩺 Medical",
          "🐾 Vet",
          "🛡️ Auto Insurance",
          "📊 Budgeting App",
          "🎁 Gifts",
          "🎄 Holiday Spending",
        ],
      },
      {
        name: "Savings",
        categories: ["🚨 Emergency Fund", "🎓 529"],
      },
      {
        name: "Wish Farm",
        categories: ["🌱 Garden Project", "💻 New Laptop", "✈️ Sunshine Trip"],
      },
    ],
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "Six broad categories and nothing else.",
    groups: [
      {
        name: "The Simple Life",
        categories: ["🍔 Food", "🏠 Needs", "💸 Wants", "✈️ Travel", "🚨 Emergency", "💰 Savings"],
      },
    ],
  },
  {
    id: "adhd",
    name: "ADHD",
    description:
      "Bills and goals, plus room for impulse buys, forgotten expenses and hyperfixations.",
    groups: [
      {
        name: "Bills",
        categories: [
          "🏠 Rent/Mortgage",
          "⚡ Electric",
          "💧 Water",
          "📶 Internet",
          "📱 Cellphone",
          "📺 Subscriptions & Streaming",
        ],
      },
      {
        name: "Frequent",
        categories: [
          "🛒 Groceries",
          "🍽️ Eating Out",
          "☕ Coffee & Drinks",
          "⛽ Gas",
          "🅿️ Parking & Tolls",
        ],
      },
      {
        name: "ADHD Tax",
        categories: [
          "🥡 Forgotten Lunch/Oops Meals",
          "⏳ Impulse Buys (Waiting Period Fund)",
          "😬 Late Fees Buffer",
        ],
      },
      {
        name: "Health & Meds",
        categories: [
          "💊 Prescriptions",
          "🛋️ Therapy/Coaching",
          "🩺 Doctor & Dentist Visits",
          "🏥 Health Insurance",
          "🏃 Gym/Movement",
        ],
      },
      {
        name: "Non-Monthly",
        categories: [
          "🚗 Car Insurance",
          "📋 Car Registration",
          "🔧 Car Maintenance",
          "🏡 Home Maintenance",
          "🔄 Annual Subscriptions",
        ],
      },
      {
        name: "Goals",
        categories: ["✈️ Vacation", "🎯 Big Purchase Fund", "🏫 Education", "🏠 Home Improvement"],
      },
      {
        name: "Quality of Life",
        categories: [
          "🌀 Hobbies & Hyperfixations",
          "🎬 Entertainment",
          "📚 Books & Courses",
          "👗 Clothing & Personal Care",
          "🐾 Pets",
        ],
      },
      {
        name: "Connection",
        categories: ["☕ Time With Friends & Family", "🎁 Gifts & Holidays", "💛 Giving"],
      },
    ],
  },
  {
    id: "back-to-school",
    name: "Back to School",
    description: "Supplies, clothes, fees and the rest of the K-12 list.",
    groups: [
      {
        name: "Back to School",
        categories: [
          "🖊️ School Supplies",
          "📚 Books & Workbooks",
          "👟 Clothes & Shoes",
          "🎒 Backpack",
          "💻 Tech & Electronics",
          "📋 School Fees & Registration",
          "🖍️ Classroom Wishlist",
          "🍱 Lunch Account",
          "🚌 Getting to School",
          "📸 School Photos",
          "📝 The Rest of the List",
          "🍕 We're Ordering Pizza",
        ],
      },
    ],
  },
  {
    id: "buying-a-home",
    name: "Buying a Home",
    description: "Down payment, closing costs, inspections, moving and reserves.",
    groups: [
      {
        name: "Home Sweet Home",
        categories: [
          "🏠 Down Payment",
          "📑 Closing Costs",
          "🔍 Inspections",
          "📈 Appraisal Fee",
          "🏡 Property Taxes",
          "🚚 Moving Costs",
          "🛠️ Repairs and Maintenance",
          "🔌 Utility Setup Fees",
          "🛋️ Furniture and Appliances",
          "🍕 Stress Food",
          "🛡️Prudent Reserves",
        ],
      },
    ],
  },
  {
    id: "college",
    name: "College",
    description: "Day-to-day life, living essentials, school costs and fun for students.",
    groups: [
      {
        name: "Day-to-Day Life",
        categories: ["📱 Cell Phone", "🚗 Transportation", "💇 Haircuts", "🍕 Late-Night Pizza"],
      },
      {
        name: "Living Essentials",
        categories: ["🏠 Dorm", "🍽️ Meal Plan", "🧴 Household Supplies"],
      },
      {
        name: "School Stuff",
        categories: ["📚 Tuition", "📖 Books", "💸 Fees", "✏️ Supplies"],
      },
      {
        name: "Fun",
        categories: ["🎉 Going Out", "🛋️ Dorm Decor", "🌴 Spring Break"],
      },
    ],
  },
  {
    id: "debt-payoff",
    name: "Debt Payoff",
    description: "Monthly and non-monthly expenses around a focus debt.",
    groups: [
      {
        name: "Monthly Expenses",
        categories: [
          "🏠 Rent/Mortgage",
          "🛜 Internet",
          "📱 Phone",
          "⚡️ Electric",
          "🎯 Focus Debt",
          "🚗 Debt #2",
          "🏫 Debt #3",
          "🛒 Groceries",
          "⛽️ Transportation",
          "💳 Credit Card Interest",
          "📺 Subscriptions",
        ],
      },
      {
        name: "Non-Monthly Expenses",
        categories: [
          "🔧 Auto Maintenance",
          "💥 Car Insurance",
          "🧦 Clothing",
          "🎁 Gifts & Holidays",
          "🛠️ Home Maintenance",
          "🏥 Medical",
          "💦 Water",
          "🐶 Vet",
        ],
      },
      {
        name: "Fun Money",
        categories: [
          "💰My Spending Money",
          "💵 Your Spending Money",
          "🍽️ Eating Out",
          "🏖️ Vacation",
        ],
      },
    ],
  },
  {
    id: "detailed-starter",
    name: "Detailed Starter",
    description:
      "A detailed setup: a month ahead, bills, a debt snowball, living costs, irregular expenses and savings.",
    groups: [
      {
        name: "One Month Ahead",
        categories: ["📅 Next Month's Money"],
      },
      {
        name: "Bills",
        categories: [
          "🏠 Mortgage + Escrow",
          "🩺 Pet Insurance",
          "🔌 Utilities",
          "🎵 Music Streaming",
          "🚗 Car Insurance",
          "📺 Streaming",
          "🏋️ Gym",
          "📱 Phone & Internet",
        ],
      },
      {
        name: "Debt Snowball",
        categories: [
          "1) Credit Card A",
          "2) Credit Card B",
          "3) Personal Loan",
          "4) Car Loan",
          "📉 CC Interest",
        ],
      },
      {
        name: "Fun Spending",
        categories: [
          "💳 My Fun Spending",
          "👛 Your Fun Spending",
          "🍽️ Dining Out",
          "🍔 Fast Food",
          "🎭 Fun",
          "💵 ATM Cash",
          "🛋️ Home Decor",
        ],
      },
      {
        name: "Monthly Living Expenses",
        categories: [
          "🛒 Groceries",
          "📦 Online Shopping",
          "⛽ Gas",
          "👕 Clothing",
          "🐾 Pet",
          "✂️ Haircuts",
          "❤️ Giving",
          "🗃️ Unexpected",
        ],
      },
      {
        name: "Kids",
        categories: ["👦 Child 1", "👧 Child 2", "🏅Kids Activities"],
      },
      {
        name: "Irregular & Annual Expenses",
        categories: [
          "🔧 Home Maintenance",
          "🚗 Auto Maintenance",
          "⚕️ Routine Medical",
          "🛡️ Life Insurance",
          "📊 Budgeting App",
          "🛒 Shopping Membership",
          "🎁 Gifts",
          "🎄 Christmas",
        ],
      },
      {
        name: "Short-Term Savings",
        categories: [
          "✈️ Long Weekends",
          "🏔️ Winter Cabin",
          "🦃 Thanksgiving",
          "🚨 Medical Emergency",
        ],
      },
      {
        name: "Savings (Tracking)",
        categories: ["💰 Income Loss", "📈 IRA Contributions", "🎓 529 Contributions"],
      },
      {
        name: "Reimbursements",
        categories: ["🔄 Reimbursements - Work", "👥 Reimbursements - Personal"],
      },
    ],
  },
  {
    id: "disaster-prep",
    name: "Disaster Prep",
    description: "Preparing for severe weather, evacuating, and recovering afterwards.",
    groups: [
      {
        name: "Evacuation",
        categories: [
          "🏠 Lodging",
          "🛒 Groceries/Dining Out",
          "🚗 Transportation",
          "🦁 Entertainment",
        ],
      },
      {
        name: "Disaster Recovery",
        categories: [
          "🛒 Grocery Replacements",
          "⚡️ Electric Repair",
          "🌱 Lawn Repair",
          "🔨 Roof Repair",
          "🪓 Tree & Stump Removal",
          "📑 Insurance Deductible",
        ],
      },
      {
        name: "Preparing for the Worst",
        categories: [
          "🪚 Chainsaw",
          "🧊 Cooler",
          "🚰 Bathtub Water Collector",
          "💧 7-gallon canteens + Water Bottles",
          "🥫 Shelf Stable Meals",
          "⛽️ Gas Cans, Gas, and Propane",
          "⚡️ Generator + Extension Cords",
          "🔋 Backup Battery + Batteries",
          "💵 Cash",
          "📻 Emergency Radio",
          "🥵 Hot Weather Gear",
          "🥶 Cold Weather Gear",
          "🎒 Bug Out Bags",
          "💚 Small Kindnesses",
        ],
      },
    ],
  },
  {
    id: "divorce",
    name: "Divorce",
    description: "Legal and practical costs of a separation, plus self-kindness.",
    groups: [
      {
        name: "Needs",
        categories: [
          "👩🏻‍⚖️ Lawyer Fees",
          "💰 Financial Consultant",
          "🧑‍🤝‍🧑 Couple's Therapist",
          "📱 Mobile Phone",
          "📺 Subscriptions/Streaming Services",
          "🏥 Health Insurance",
          "🛋️ My Therapy",
          "🧒 Kids' Therapy",
          "📦 Moving Company and Supplies",
        ],
      },
      {
        name: "Self-Kindness",
        categories: [
          "🍏 Takeout for Bad Days",
          "☕️ Coffee with Supportive Friends",
          "📚 Books and Audiobooks",
          "😍 Travel with Kids",
          "🫕 Crock Pot Money (Holding Category)",
        ],
      },
      {
        name: "Situational",
        categories: ["👶 Babysitter/Additional Child Care", "🎨 Kids Activities"],
      },
    ],
  },
  {
    id: "emergency-fund",
    name: "Emergency Fund",
    description: "An emergency fund split by the kinds of emergencies it covers.",
    groups: [
      {
        name: "Ready for Emergencies",
        categories: [
          "💻 Tech Replacement",
          "🐱 Pet Illness",
          "🚙 Car Repairs",
          "🏥 ER/Urgent Care Visits",
          "📺 Appliance Repair/Replacement",
          "🕵️ Income Replacement",
          "🌪️ Natural Disasters",
          "🏚️ Home Repairs",
          "📑 Insurance Deductibles",
          "⚰️ Funerals/Grief Fund",
          "💌 Unexpected Travel",
          "🫶 Helping Others",
          "🔄 Change of Plans",
          "🔓 Locksmith",
        ],
      },
    ],
  },
  {
    id: "family",
    name: "Family",
    description: "Childcare, school, activities, birthdays and family fun.",
    groups: [
      {
        name: "Family Life",
        categories: [
          "🎓 School Supplies",
          "🧒 Childcare",
          "👗 Haircuts & Clothes",
          "📱 Cell Phone",
          "🎻 Violin",
          "⚽ Sports & Activities",
          "🎁 Birthday Party Gifts (Friends)",
          "🎉 Birthday (Their Party)",
          "🎄 Christmas",
          "🎨 Family Fun",
          "🏕️ Summer Camp",
          "🌴 Family Vacation",
          "💰 Cushion",
        ],
      },
    ],
  },
  {
    id: "food",
    name: "Food",
    description: "Groceries, eating out, coffee and treats.",
    groups: [
      {
        name: "Nom Noms",
        categories: [
          "🛒 Grocery Store",
          "🏬 Warehouse Club",
          "🍽️ Not Cooking",
          "☕ Coffee",
          "🧁 Li'l Treats",
        ],
      },
    ],
  },
  {
    id: "happiness",
    name: "Happiness",
    description: "Intentional spending on the things that make you happy.",
    groups: [
      {
        name: "Money CAN Buy Happiness!",
        categories: [
          "🌿 Plants",
          "🎭 Laughter",
          "🫶 Random Acts of Kindness",
          "✈️ Just Leave",
          "🎤 Broadway Shows",
          "📚 Books",
          "👜 Treat Yo' Self",
          "🌈 Suncatchers",
          "🥘 Special Meals",
          "💞 Taking Friends Out",
          "💌 Giving",
          "🕯️ Coziness",
          "🛍️ Supporting Local Businesses",
          "🧠 Learning New Things",
          "💆 Massages",
          "🧵 Quality over Quantity",
          "🧶 Hobbies",
          "🏞️ Touch Grass",
          "🖍️ Quality Time with Family",
          "🧹 Delegating Care Tasks",
        ],
      },
    ],
  },
  {
    id: "holiday",
    name: "Holiday",
    description: "Gifts, decorations, parties, travel and the sneaky holiday extras.",
    groups: [
      {
        name: "North Pole",
        categories: [
          "🎄 Decorations",
          "🎀 Presents",
          "🎉 Parties",
          "🧦 Stocking Stuffers",
          "🍽 Holiday Food",
          "✨ Christmas Magic",
          "🍾 Liquid Holiday Cheer",
          "👗 Holiday Outfits",
          "📬 Christmas Cards",
          "🚗 Travel",
          "📦 Shipping",
          "💳 Last Minute Holiday Stuff",
        ],
      },
    ],
  },
  {
    id: "home-project",
    name: "Home Project",
    description: "Labor, materials, appliances, fixtures and decor for a renovation.",
    groups: [
      {
        name: "Labor",
        categories: [
          "🛠️ Demolition",
          "💡 Electrician",
          "🔧 Plumber/HVAC",
          "👷‍♂️ General contractor",
          "🎨 Designer",
          "🪚 Refinishing hardwood floor",
          "🔒 Locksmith",
        ],
      },
      {
        name: "Materials",
        categories: [
          "🪟 Countertops",
          "🧱 Backsplash",
          "🪵 Flooring and tile",
          "🎨 Paint",
          "🚪 Cabinets",
        ],
      },
      {
        name: "Appliances",
        categories: ["🍳 Kitchen appliances", "🌬️ Range hood"],
      },
      {
        name: "Fixtures",
        categories: ["💡 Lighting", "🚰 Kitchen faucet", "🚿 Bathroom fixtures"],
      },
      {
        name: "Decor",
        categories: ["🛋️ Rugs", "🛏️ Furniture", "📺 TV and speakers"],
      },
      {
        name: "Miscellaneous",
        categories: ["🗑️ Dumpster rental", "🛏️ Self care during renovation", "⚠️ Emergency fund"],
      },
    ],
  },
  {
    id: "house-projects-queue",
    name: "House Projects Queue",
    description: "A prioritised queue of projects for a newly bought house.",
    groups: [
      {
        name: "House Project Queue",
        categories: [
          "😴 New Bed",
          "⚠️ $8K For Surprises",
          "🪭 Radon Mitigation",
          "😅 (De)humidifier",
          "💧 Water Quality Test",
          "💦 Water Filtration",
          "💨 HVAC Cleaning",
          "🚂 Hot Water Heater",
          "🖌️ Popcorn Ceiling Removal & Fresh Paint",
          "🔌 Electrical To Code",
          "☔️ Drainage Solutions",
          "🪵 Chimney Flashing",
          "🫧 Washer & Dryer",
          "🧑‍🌾 Starter Garden",
          "🐓 Chickens",
          "🚪 Replace Interior Door",
          "🧊 Refrigerator",
          "🌳 Tree Removal",
          "🏦 Cost To Refinance",
          "🍳 Stove Hood Vent",
          "🌄 Glass Front Door",
          "🐐 Goats Landscaping",
          "🧱 Retaining Wall",
          "🛖 Ridge Vent",
          "🧹 Roof Soft Cleaning",
          "🛋️ Furniture",
        ],
      },
    ],
  },
  {
    id: "job-layoff",
    name: "Job Layoff",
    description: "Protect the essentials, fund the job search, and rebuild.",
    groups: [
      {
        name: "Essentials to Protect",
        categories: [
          "🏡 Rent/Mortgage",
          "💡 Utilities",
          "🥦 Groceries",
          "🚗 Transportation",
          "🧾 Minimum Debt Payments",
          "🩺 Insurance Premiums",
          "💊 Prescriptions/Medical Essentials",
        ],
      },
      {
        name: "Transition & Job Search",
        categories: [
          "🏥 COBRA/Health Coverage Gap",
          "🧑‍💼 Job Search Costs",
          "🎓 Skill Building/Courses",
          "☕ Networking & Coffee Meetings",
          "🧸 Childcare (While Job Hunting)",
          "💰 Unemployment Taxes",
          "📦 Moving Costs",
        ],
      },
      {
        name: "Rebuilding & What’s Next",
        categories: [
          "💵 Rebuild Emergency Fund",
          "📈 Catch Up on Savings Goals",
          "🧘‍♀️ Care & Recovery",
          "🎉 Celebrate the New Job",
        ],
      },
    ],
  },
  {
    id: "kid",
    name: "Kid",
    description: "A simple spend / save / give setup for teaching kids about money.",
    groups: [
      {
        name: "Piggy Bank",
        categories: ["🍭 Spend", "📱 Save | Soon", "🏫 Save | Later", "🤲 Give"],
      },
    ],
  },
  {
    id: "kitchen-remodel",
    name: "Kitchen Remodel",
    description: "Appliances, surfaces, labor and surprises for a kitchen remodel.",
    groups: [
      {
        name: "Kitchen Remodel",
        categories: [
          "🍽️ Dishwasher",
          "🌬️ Vent Hood",
          "🔥 New Cooktop",
          "🧱 Countertops",
          "🚰 Sink",
          "🖼️ Backsplash",
          "💡 Lighting",
          "🛁 Bathroom Tile",
          "🔧 Gas Line and Plumbing",
          "🎨 Painting & Ceiling Repair",
          "🛠️ Labor",
          "😬 Surprise Problems",
          "🛒 Stuff We Forgot at the Store",
          "🥡 Kitchen in Shambles Meals",
        ],
      },
    ],
  },
  {
    id: "moving",
    name: "Moving",
    description: "Deposits, supplies, movers, travel and settling in.",
    groups: [
      {
        name: "Before You Move",
        categories: [
          "💰 Security Deposit",
          "🗓️ First Month's Rent",
          "📈 Rent/Mortgage Difference",
          "📝 Application Fees",
          "🔌 Utility Set-Up Fees",
          "🛡️ Renter’s/Home Insurance",
        ],
      },
      {
        name: "Supplies & Services",
        categories: [
          "📦 Moving Supplies",
          "🚚 Moving Truck",
          "👷‍♀️ Professional Movers",
          "🔒 Storage Unit",
          "🧽 Cleaning Supplies",
          "🧼 Cleaning Services",
        ],
      },
      {
        name: "Helpers & Hospitality",
        categories: ["🍕 Pizza & Drinks", "🎁 Thank You Gifts", "🐶 Childcare or Pet Boarding"],
      },
      {
        name: "Transportation & Travel",
        categories: ["⛽ Fuel", "🛏️ Hotel", "🥪 Grab & Go Meals"],
      },
      {
        name: "Unexpected",
        categories: [
          "🌀 Buffer",
          "💔 Lost or Broken Items",
          "🔁 Overlap Costs",
          "🍱 First Night Takeout",
          "🔑 Settling in Fund",
        ],
      },
    ],
  },
  {
    id: "navigating-loss",
    name: "Navigating Loss",
    description: "Practical expenses after the death of a loved one.",
    groups: [
      {
        name: "Funeral & Memorial",
        categories: [
          "Funeral Home Services",
          "Cremation or Burial",
          "Clergy Fee",
          "Obituary 🕊️",
          "Casket or Urn",
          "Burial Plot or Headstone",
          "Clothing for Service",
        ],
      },
      {
        name: "Celebration or Gathering",
        categories: [
          "Venue Rental",
          "Flowers 💐",
          "Food & Drinks",
          "Programs & Photos",
          "Music or A/V",
          "Memorial Keepsakes 💗",
        ],
      },
      {
        name: "Legal & Administrative",
        categories: [
          "Death Certificates",
          "Estate or Legal Fees",
          "Notary or Administrative Costs",
          "Travel for Legal Matters",
        ],
      },
      {
        name: "Travel & Logistics",
        categories: ["Flights or Gas", "Hotels & Lodging", "Meals", "Childcare / Petcare"],
      },
      {
        name: "Accounts & Ongoing Costs",
        categories: [
          "Canceling Subscriptions & Utilities",
          "Social Media Accounts",
          "Estate or Home Expenses",
          "Cleaning / Storage",
          "Thank-Yous 💌",
        ],
      },
      {
        name: "Support & Grieving",
        categories: [
          "Counseling or Therapy",
          "Grief Support or Books",
          "Self Care ☕",
          "Grief Brain 🫠",
        ],
      },
      {
        name: "Honoring Their Memory",
        categories: [
          "Charitable Donations 🎗️",
          "Legacy Gifts 🌱",
          "Website Hosting",
          "Photo & Video Digitization",
        ],
      },
    ],
  },
  {
    id: "new-baby",
    name: "New Baby",
    description: "From medical costs and baby gear to the first few months.",
    groups: [
      {
        name: "Stork Delivery",
        categories: [
          "🩺 Medical Costs",
          "💞 Doula Service",
          "🍼 Baby Gear",
          "🛏️ Nursery",
          "💵 Income Replacement",
          "👗 Maternity Clothes",
          "🧷 Diapers & Wipes",
          "🎉 Memories and Announcements",
          "🧘‍♀️ Just for Me",
          "🔄 Miscellaneous",
          "🍔 Dark Days Food Delivery",
          "❓ Don't Know Yet",
        ],
      },
    ],
  },
  {
    id: "new-car",
    name: "New Car",
    description: "The true cost of a new car: purchase, insurance, registration and upkeep.",
    groups: [
      {
        name: "New Car",
        categories: [
          "🚗 Car Purchase",
          "💰 Down Payment",
          "🏦 Car Loan Payment",
          "📜 Car Warranty",
          "🛡️ Insurance",
          "💵 Deductible",
          "📋 License & Registration",
          "✅ Safety/Emissions Inspection",
          "🔧 Maintenance & Repairs",
          "🛞 Tires",
          "⛽ Gas",
          "⭐️ Accessories",
          "✨ Personalization",
          "🔄 Subscriptions",
        ],
      },
    ],
  },
  {
    id: "new-puppy",
    name: "New Puppy",
    description: "Getting a puppy home, then the ongoing costs.",
    groups: [
      {
        name: "Fur Baby",
        categories: [
          "💵 Adoption/Breeder Fee",
          "💉 Vaccinations",
          "📦 Supplies",
          "🐾 Training/Classes",
        ],
      },
      {
        name: "Ongoing Puppy",
        categories: [
          "🦴 Food",
          "🧸 Toys",
          "📑 Pet Medical",
          "🏡 Day Care",
          "🛁 Pawdicures",
          "🚑 Surprise Vet Visits",
          "🔄 Puppy Mischief Money",
          "📸 Extra phone storage for all the pics",
        ],
      },
    ],
  },
  {
    id: "new-years-resolutions",
    name: "New Year's Resolutions",
    description: "Fund this year's goals: dreams, relationships, money, wellness and career.",
    groups: [
      {
        name: "Big Dreams",
        categories: ["🧳 Travel", "🪣 Bucket List", "👩‍🏫 Lessons (e.g. Music, Art, Karate)"],
      },
      {
        name: "Family & Friends",
        categories: [
          "💑 Date Night",
          "☕️ Coffee with Friends",
          "📚 Book Club Snacks",
          "😍 Random Act of Kindness",
        ],
      },
      {
        name: "Money",
        categories: ["💳 Debt Paydown", "📈 Investing a little extra", "💌 Charitable Giving"],
      },
      {
        name: "Wellness Goals",
        categories: ["🧘 Meditation App", "💪 Gym Membership", "💗 Therapy", "🍏 Nutritionist"],
      },
      {
        name: "Personal Goals",
        categories: [
          "🗣️ Language Learning App",
          "📚 Audiobook Subscription",
          "🙏 Gratitude Journal",
          "🌅 Sunrise Alarm",
          "🤝 Volunteering",
          "🧶 Learn a new hobby",
          "📵 Social Media Blocking App",
        ],
      },
      {
        name: "Career",
        categories: ["📌 Continuing Education", "📎 Career Coaching", "👩‍💻 Job Board Subscriptions"],
      },
    ],
  },
  {
    id: "non-monthly-expenses",
    name: "Non-Monthly Expenses",
    description: "Sinking funds for bills and expenses that don't come every month.",
    groups: [
      {
        name: "Non-Monthly Bills",
        categories: [
          "💧 Water bill",
          "🗑️ Trash service",
          "🔥 Gas bill",
          "🚗 Transportation",
          "🛠️ Auto maintenance",
          "📄 Car registration",
          "🛡️ Car insurance premiums",
          "🏡 Home maintenance",
          "🏠 Renter/home insurance",
          "🏥 Health care",
          "🏠 Property taxes",
          "🔒 Life insurance",
          "💵 Taxes",
        ],
      },
      {
        name: "Non-Monthly Expenses",
        categories: [
          "👗 Clothing",
          "🎁 Gifts",
          "🎂 Birthday Bash Bucks",
          "🤲 Charitable giving",
          "💻 Computer/phone replacement",
          "📦 Software subscriptions",
          "📺 Entertainment subscriptions",
          "✈️ Vacation",
          "🏃‍♀️ Muscle money",
          "🎓 Education",
          "🎮 Gaming",
          "🎄 Holiday",
          "🎉 Other Holidays",
          "🏠 Hosting",
          "💑 Dates",
          "💄 Beauty",
          "🎬 Entertainment",
          "🏬 Warehouse membership",
          "💳 Credit card annual fee",
          "🏠 House decor",
          "🏦 Banking",
          "🛒 Household goods",
          "🐾 Fur baby",
        ],
      },
    ],
  },
  {
    id: "party-planning",
    name: "Party Planning",
    description: "Venue, invitations, decorations, food and drinks for a party.",
    groups: [
      {
        name: "Party Planning",
        categories: [
          "📍 Venue",
          "🪑 Tables & Chairs",
          "✉️ Invitations",
          "🎈 Decorations",
          "🎉 Favors",
          "🏸 Activities & Games",
          "🏷️ Name Tags",
          "🍽️ Tableware & Napkins",
          "🌭 Food",
          "🎂 Dessert",
          "🥤 Drinks & Ice",
          "🛟 Forgot Something",
        ],
      },
    ],
  },
  {
    id: "recently-graduated",
    name: "Recently Graduated",
    description: "Monthly and non-monthly costs for a recent graduate, with a six-month buffer.",
    groups: [
      {
        name: "Monthly Expenses",
        categories: [
          "🏠 Rent/Utilities",
          "🛒 Groceries/Personal",
          "🚗 Transportation",
          "🍽️ Dining Out",
          "💪 Health/Fitness",
          "🩺 Health Insurance",
          "💇‍♂️ Personal Care",
          "🚙 Car Insurance",
          "📱 Phone Bill",
        ],
      },
      {
        name: "Non-Monthly Expenses",
        categories: [
          "💳 Credit Card Annual Fee",
          "🎬 Entertainment",
          "🔧 Car Maintenance",
          "🎵 Music Business Expenses",
          "🧹 Household Items",
          "❤️ Dates",
          "🎁 Gifts",
          "🎸 Music Gear",
          "✈️ Travel",
          "💰 Taxes",
        ],
      },
      {
        name: "Savings",
        categories: ["🛡️ Six-Month Buffer", "🌍 Europe 2026", "📈 Investments"],
      },
    ],
  },
  {
    id: "retirement",
    name: "Retirement",
    description: "Needs, wants, wishes and a contingency fund for spending retirement well.",
    groups: [
      {
        name: "Needs: Base Great Life",
        categories: [
          "🏠 Housing",
          "🛒 Food",
          "💡 Utilities & service subscriptions",
          "👗 Clothing",
          "🎬 Entertainment & Base Travel",
          "🚗 Transportation",
          "🏥 Healthcare",
          "🛡️ Insurance Policy Premium",
          "📝 Insert Your Own Here",
        ],
      },
      {
        name: "Wants",
        categories: [
          "🌍 Additional Travel",
          "🎨 Retirement Hobbies & Fun",
          "🔨 Home Improvement",
          "🎁 Gifting",
          "📝 Insert Your Own Here",
        ],
      },
      {
        name: "Wishes",
        categories: [
          "🥳 Celebration",
          "🤝 Provide Care for Loved One",
          "🎓 Education for Kids/Grandkids",
          "🏠 New Home",
          "🚀 Start Business",
          "📝 Insert Your Own Here",
        ],
      },
      {
        name: "Contingency Fund",
        categories: ["⛑️ Contingency Fund"],
      },
    ],
  },
  {
    id: "small-business",
    name: "Small Business",
    description: "Cost of the work, paying yourself, running the business, and taxes.",
    groups: [
      {
        name: "Cost of the Work",
        categories: ["🧑‍🏫 Contractor Pay", "🧰 Job Materials", "💳 Payment Processing"],
      },
      {
        name: "Paying Myself",
        categories: ["🫵 Owner's Pay", "🏥 Health & Retirement"],
      },
      {
        name: "Running the Business",
        categories: [
          "👋 Employee Pay",
          "🖥️ Software & Tools",
          "📣 Marketing",
          "🏢 Workspace",
          "🧑‍⚖️ Accounting & Legal",
          "🔁 Licenses & Renewals",
          "🛡️ Insurance",
          "✈️ Travel & Meetings",
          "📚 Learning & Growth",
          "🤷 Didn't See That Coming",
        ],
      },
      {
        name: "Hands Off!",
        categories: ["🧾 Sales Tax Collected", "🏛️ Quarterly Taxes", "📈 Profit"],
      },
    ],
  },
  {
    id: "teaching",
    name: "Teaching Budget",
    description: "A simple monthly / non-monthly / goals setup for teaching groups about money.",
    groups: [
      {
        name: "Monthly",
        categories: [
          "🏡 Mortgage",
          "🛜 Internet",
          "⚡️ Electric",
          "📱 Phone",
          "🔔 Subscriptions",
          "🎓 Student Loan",
          "🚗 Auto Loan",
          "🛒 Groceries",
          "🍽️ Eating Out",
          "⛽️ Transportation",
          "🎉 My Fun Money",
          "🎮 Your Fun Money",
        ],
      },
      {
        name: "Non-Monthly",
        categories: [
          "🔧 Auto Maintenance",
          "🛡️ Car Insurance",
          "🧦 Clothing",
          "🎁 Gifts & Holidays",
          "🔨 Home Maintenance",
          "🏥 Medical",
          "❓ Stuff I Forgot",
          "🚙 Vehicle Registration",
          "🐾 Pets",
        ],
      },
      {
        name: "Goals",
        categories: ["🛠️ New Deck", "⛱️ Vacation", "☕️ Coffee Grinder"],
      },
    ],
  },
  {
    id: "teen",
    name: "Teen",
    description: "Expenses, a wish list and long-term savings for a teenager.",
    groups: [
      {
        name: "My Expenses",
        categories: [
          "🍔 Snacks & Food",
          "💄 Clothing/Skincare",
          "🎁 Gifts & Giving",
          "🎈 Fun",
          "🚗 Car Costs",
          "💪 Gym!",
          "📱 Phone",
          "💸 Owe the Parents",
        ],
      },
      {
        name: "Wish Farm",
        categories: [
          "🌎 Travel!",
          "🦋 Concert Tickets",
          "🧶 Sweatshirt",
          "🥿 Slippers",
          "🐢 Phone Case",
        ],
      },
      {
        name: "Someday!",
        categories: ["💰 Savings", "💼 Roth IRA"],
      },
    ],
  },
  {
    id: "theme-park-trip",
    name: "Theme Park Trip",
    description: "Lodging, flights, tickets and park expenses for a theme park vacation.",
    groups: [
      {
        name: "Theme Park Trip",
        categories: [
          "🏨 Lodging",
          "🚗 Travel Days",
          "✈️ Flights",
          "🎟️ Park Tickets",
          "🧞‍♂️ Park Expenses",
          "📿 Park Wristbands",
          "⚡ Skip-the-Line Passes",
          "💼 Baggage Fees",
          "🐶 Dog Boarding",
          "🧳 Vacation Prep",
          "❗ Unexpected Expenses",
        ],
      },
    ],
  },
  {
    id: "travel",
    name: "Travel",
    description: "Flights, lodging, meals and activities for a trip.",
    groups: [
      {
        name: "Vacation",
        categories: [
          "✈️ Flights",
          "🏨 Lodging",
          "🚗 Transportation",
          "🍪 Snacks",
          "🍽️ Meals",
          "💸 Tips/Gratuities",
          "🎟️ Activities/Experiences",
          "🛍️ Trip Treasures",
          "🐾 Pet Sitting/House Sitting",
          "🅿️ Parking",
        ],
      },
    ],
  },
  {
    id: "values-based",
    name: "Values-Based",
    description:
      "Categories grouped by what you value: joy, relationships, home, health, giving and more.",
    groups: [
      {
        name: "Joy",
        categories: [
          "🎨 Art Supplies",
          "🍽️ Date Night",
          "☕ Coffee Shops",
          "💳 My Spending",
          "👛 Partner Spending",
          "📺 Streaming",
          "🏞️ Weekend Adventures",
        ],
      },
      {
        name: "Relationship Building",
        categories: [
          "👨‍👩‍👧‍👦 Family Dining Out",
          "🩺 Pet Insurance + Expenses",
          "🎁 Gifts",
          "🎄 Christmas",
        ],
      },
      {
        name: "Home",
        categories: [
          "🏠 Mortgage",
          "📱 Phone/Internet",
          "🔌 Utilities",
          "🐜 Pest Control",
          "🗑️ Trash",
          "🛠️ Tools",
          "🪚 Large Home Projects",
          "🔧 Routine Home Maintenance",
        ],
      },
      {
        name: "Health/Appearance",
        categories: [
          "🛒 Groceries + Household",
          "👕 Clothing",
          "💪 Fitness Clothing + Shoes",
          "💄 Cosmetics",
          "✂️ Haircut",
          "🏋️ Fitness App Subscription",
        ],
      },
      {
        name: "Spiritual/Giving",
        categories: ["❤️ Giving/Donating", "📖 Bible Study"],
      },
      {
        name: "Vehicles",
        categories: ["⛽ Gas", "🚗 Car Insurance", "🔧 Car Maintenance", "📝 Car Registration"],
      },
      {
        name: "Camping/Travel",
        categories: [
          "🛢️ Gas + Propane",
          "⛺ Campgrounds",
          "🚐 RV Insurance",
          "🏕️ Yearly Memberships (RV)",
          "🛻 Truck Insurance",
          "🛻 Truck Maintenance",
          "📋 Truck Registration",
        ],
      },
      {
        name: "Wealth Building",
        categories: ["💵 Our Roth IRAs"],
      },
      {
        name: "Preparation",
        categories: [
          "🏡 Emergency: House",
          "🛡️ Emergency: Income Loss",
          "⚕️ Emergency: Medical",
          "🐾 Emergency: Pets",
          "🩺 Health Insurance",
        ],
      },
      {
        name: "Unexpected",
        categories: ["❗ Unexpected Expenses", "🔄 Reimbursements"],
      },
    ],
  },
  {
    id: "variable-income",
    name: "Variable Income",
    description: "Personal and business expenses for an irregular income.",
    groups: [
      {
        name: "Personal Expenses",
        categories: [
          "🏠 Rent/Mortgage",
          "⚡️ Utilities",
          "🛒 Groceries",
          "☕️ Coffee/Dining Out",
          "👶🏼 Kid Stuff",
          "🎬 Subscriptions",
          "⛽️ Gas",
        ],
      },
      {
        name: "Business Expenses",
        categories: [
          "🔮 Get a Month Ahead",
          "💇🏻‍♀️ Booth Rent",
          "🦺 Insurance",
          "🎨 Color",
          "💆🏻‍♀️ Hair Products",
          "🧤 Foils/Gloves/Materials",
          "📆 Booking System",
          "💻 Marketing (Website, Ads, Tradeshows)",
          "💈 Equipment Repair/Replacement",
          "💰Taxes",
          "🚰 Utilities",
          "✂️ Education/Conventions",
          "🪪 Business Licence",
          "🩺 Health Insurance",
        ],
      },
      {
        name: "Workplace Perks",
        categories: [
          "☕️ Coffee for Coworkers",
          "🍬 Holiday Treats",
          "🎁 Client Appreciation",
          "💌 Charitable Giving",
          "🏝️ Vacation",
        ],
      },
    ],
  },
  {
    id: "wedding",
    name: "Wedding",
    description: "Ceremony, guests, wardrobe, vendors and surviving wedding week.",
    groups: [
      {
        name: "Ceremony & Reception",
        categories: [
          "🏰 Venue",
          "🍽️ Catering",
          "🎂 Cake",
          "🍹 Drinks",
          "📜 Marriage License",
          "🎵 Musicians",
          "🎧 DJ",
          "🏨 Wedding Night Hotel",
          "🎉 Miscellaneous",
        ],
      },
      {
        name: "Invitations and Guests",
        categories: [
          "✉️ Invites, Save the Dates, Postage",
          "🚗 Transportation",
          "🎁 Favors",
          "🎁 Gifts for Bridal Party",
        ],
      },
      {
        name: "Wardrobe",
        categories: [
          "💍 Wedding Bands",
          "✂️ Alterations",
          "👗 Accessories",
          "💄 Hair & Makeup",
          "🔔 Dress/Suit/Tux/Attire",
        ],
      },
      {
        name: "Vendors",
        categories: [
          "🌸 Florist",
          "📸 Photographer",
          "🎥 Videographer",
          "📋 Event Coordinator",
          "💸 Tips",
        ],
      },
      {
        name: "Decor & More",
        categories: ["🎀 Decor", "🍽️ Rehearsal Dinner", "🎈 Miscellaneous"],
      },
      {
        name: "Surviving Wedding Week",
        categories: ["🍕Late-night pizza delivery", "💆‍♂️Emergency massage", "☕Powered by caffeine"],
      },
    ],
  },
  {
    id: "wish-farm",
    name: "Wish Farm",
    description: "Save intentionally for the things you want.",
    groups: [
      {
        name: "Wish Farm",
        categories: ["✨ New Puzzle", "🌟 Bike", "🌠 Mediterranean Cruise"],
      },
      {
        name: "Wish List",
        categories: ["💆‍♀️ Massage", "🏖️ Weekend Away", "🍤 Bottomless Shrimp Night"],
      },
    ],
  },
];

export function getBudgetTemplate(id: string): BudgetTemplate | undefined {
  return BUDGET_TEMPLATES.find((t) => t.id === id);
}
