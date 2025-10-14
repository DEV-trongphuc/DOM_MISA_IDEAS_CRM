// ----------------------------------------
// ⚙️ Cấu hình Tag ưu tiên
// ----------------------------------------
const TAG_PRIORITY = [
  "Qualified",
  "Needed",
  "Considering",
  "Bad timing",
  "Unqualified",
  "Status - Junk",
  "New",
];

// ----------------------------------------
// 📥 Lấy dữ liệu giả lập từ local file
// ----------------------------------------
let CRM_DATA = [];

async function fetchLeads(from, to) {
  document.querySelector(".loading").classList.add("active");
  let token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJQYXlMb2FkRGF0YSI6ImQ2NTY0OWFmLTQyMjYtNDE0OC1hNzg4LTIyNGJmMjE1MTUxMSIsImV4cCI6MTc2MDQ4OTI4MywiaXNzIjoiTUlTQSIsImF1ZCI6IkFNSVNDUk0yIn0.oFVHrG1sxhGck7rwTMRGhM0oOTAstgLDD8w1UhnughI";

  while (true) {
    const url = `https://ideas.edu.vn/proxy_misa.php?from_date=${from}&to_date=${to}&token=${token}`;
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        alert("Lỗi: " + data.error + ". Nhập token mới.");
        token = null;
        localStorage.removeItem("misa_token");
        continue;
      }

      if (!data.data || data.data.length === 0) {
        alert("Không có dữ liệu!");
        token = null;
        localStorage.removeItem("misa_token");
        continue;
      }

      CRM_DATA = data.data;
      document.querySelector(".loading").classList.remove("active");
      return CRM_DATA;
    } catch (err) {
      console.error(err);
      alert("Không lấy được dữ liệu, thử token khác");
      token = null;
      localStorage.removeItem("misa_token");
    }
  }
}

// ----------------------------------------
// 🧠 Hàm xử lý tag
// ----------------------------------------
function getTagsArray(tagText) {
  if (!tagText) return [];
  return tagText
    .split(",")
    .map((t) => t.trim().replace(/^0\.\s*/, "")) // bỏ tiền tố "0."
    .filter(Boolean);
}

function getPrimaryTag(tags) {
  for (let i = 0; i < TAG_PRIORITY.length; i++) {
    const t = TAG_PRIORITY[i];
    if (tags.includes(t)) return t;
  }
  return "Uncategorized";
}
function getTagsArray(tagText) {
  if (!tagText) return [];
  return tagText
    .split(",")
    .map((t) => t.trim().replace(/^0\.\s*/g, "")) // bỏ tiền tố “0.”
    .filter(Boolean);
}

function getPrimaryTag(tags, priorityList) {
  for (const p of priorityList) {
    if (tags.some((t) => t.includes(p))) return p;
  }
  return "New";
}

// ----------------------------------------
// 🧩 Xử lý dữ liệu chính
// ----------------------------------------
function processCRMData(data) {
  const result = {
    byDate: {}, // 🗓️ chứa dữ liệu theo ngày + thống kê tag
    byCampaign: {}, // 📢 Campaign > Source > Medium
    byOwner: {}, // 👤 Theo người phụ trách
    byTag: {}, // 🏷️ Theo tag chính
    byTagAndDate: {}, // 🏷️ + 📅 tag và ngày
    byOrg: {}, // 🏢 Theo IDEAS / VTCI
    tagFrequency: {}, // 🔢 Thống kê tần suất tag phụ
  };

  const tagPriority = [
    "Needed",
    "Considering",
    "Bad timing",
    "Unqualified",
    "Junk",
    "New",
  ];

  for (let i = 0; i < data.length; i++) {
    const lead = data[i];

    // 🗓️ Ngày tạo
    const dateKey = lead.CreatedDate?.slice(0, 10) || "Unknown Date";

    // 🏷️ Tag
    const tags = getTagsArray(lead.TagIDText);
    const mainTag = getPrimaryTag(tags, tagPriority);
    lead.TagMain = mainTag; // ✅ Gán trực tiếp vào lead cho các phần khác dùng

    // 🏢 Đơn vị (IDEAS / VTCI)
    const org = lead.CustomField16Text || "Unknown Org";

    // 🔢 Đếm tần suất tất cả tag (phụ)
    for (const tag of tags) {
      result.tagFrequency[tag] = (result.tagFrequency[tag] || 0) + 1;
    }

    // ================================
    // 📅 1️⃣ Nhóm theo ngày + thống kê tag
    // ================================
    if (!result.byDate[dateKey]) result.byDate[dateKey] = { total: 0 };
    result.byDate[dateKey].total++;
    result.byDate[dateKey][mainTag] =
      (result.byDate[dateKey][mainTag] || 0) + 1;

    // ================================
    // 🏷️ 2️⃣ Nhóm theo tag chính
    // ================================
    if (!result.byTag[mainTag]) result.byTag[mainTag] = [];
    result.byTag[mainTag].push(lead);

    // ================================
    // 🏷️ + 📅 3️⃣ Nhóm theo tag + ngày
    // ================================
    if (!result.byTagAndDate[mainTag]) result.byTagAndDate[mainTag] = {};
    if (!result.byTagAndDate[mainTag][dateKey])
      result.byTagAndDate[mainTag][dateKey] = [];
    result.byTagAndDate[mainTag][dateKey].push(lead);

    // ================================
    // 📢 4️⃣ Nhóm theo Campaign / Source / Medium
    // ================================
    const campaign = lead.CustomField13Text || "Unknown Campaign";
    const source = lead.CustomField14Text || "Unknown Source";
    const medium = lead.CustomField15Text || "Unknown Medium";

    if (!result.byCampaign[campaign]) result.byCampaign[campaign] = {};
    if (!result.byCampaign[campaign][source])
      result.byCampaign[campaign][source] = {};
    if (!result.byCampaign[campaign][source][medium])
      result.byCampaign[campaign][source][medium] = [];

    result.byCampaign[campaign][source][medium].push(lead);

    // ================================
    // 👤 5️⃣ Nhóm theo Owner
    // ================================
    const owner = lead.OwnerIDText || "No Owner";
    if (!result.byOwner[owner])
      result.byOwner[owner] = { total: 0, tags: {}, leads: [] };

    result.byOwner[owner].total++;
    result.byOwner[owner].leads.push(lead);

    if (!result.byOwner[owner].tags[mainTag])
      result.byOwner[owner].tags[mainTag] = { count: 0, leads: [] };

    result.byOwner[owner].tags[mainTag].count++;
    result.byOwner[owner].tags[mainTag].leads.push(lead);

    // ================================
    // 🏢 6️⃣ Nhóm theo tổ chức (IDEAS / VTCI)
    // ================================
    if (!result.byOrg[org]) {
      result.byOrg[org] = {
        total: 0,
        tags: {},
        owners: {},
        byDate: {},
      };
    }

    result.byOrg[org].total++;

    // Nhóm theo tag trong từng org
    if (!result.byOrg[org].tags[mainTag]) result.byOrg[org].tags[mainTag] = [];
    result.byOrg[org].tags[mainTag].push(lead);

    // Nhóm theo owner trong từng org
    if (!result.byOrg[org].owners[owner]) result.byOrg[org].owners[owner] = [];
    result.byOrg[org].owners[owner].push(lead);

    // Nhóm theo ngày trong từng org
    if (!result.byOrg[org].byDate[dateKey])
      result.byOrg[org].byDate[dateKey] = [];
    result.byOrg[org].byDate[dateKey].push(lead);
  }

  // ✅ Sắp xếp byDate theo thời gian tăng dần (để chart render mượt)
  result.byDate = Object.fromEntries(
    Object.entries(result.byDate).sort(([a], [b]) => a.localeCompare(b))
  );

  return result;
}

// ----------------------------------------
// 🚀 Chạy thử
// ----------------------------------------
let RAW_DATA = [];
let GROUPED = {};
let leadChartInstance = null;
let currentTagFilter = "Needed"; // ✅ mặc định filter chart theo tag này
const currentFilter = { campaign: null, source: null, medium: null };

// ----------------------------------------
// 🚀 Main
// ----------------------------------------
async function main() {
  const initRange = getDateRange("this_month");

  // 🔹 Fetch dữ liệu mặc định theo tháng hiện tại
  RAW_DATA = await fetchLeads(initRange.from, initRange.to);

  // ✅ Lần đầu process toàn bộ dữ liệu
  GROUPED = processCRMData(RAW_DATA);
  window.grouped = GROUPED;

  // ✅ Render filter và chart ngay lần đầu
  renderFilterOptions();
  setupDropdowns();
  setupTimeDropdown();
  setupAccountFilter();
  setupClearFilter();
  setupQualityFilter();

  // ✅ Lần đầu vẽ chart
  renderLeadTrendChart(GROUPED);
  renderToplist(GROUPED);
  renderCampaignPieChart(GROUPED);
  renderLeadTable(RAW_DATA);

  renderTagFrequency(GROUPED);

  renderLeadQualityMeter(GROUPED);

  // ✅ thêm dòng này
}

main();

// ============================
// RENDER FILTERS
// ============================
function renderFilterOptions() {
  const campaignSelect = document.querySelector(
    ".dom_select.campaign ul.dom_select_show"
  );
  const sourceSelect = document.querySelector(
    ".dom_select.source ul.dom_select_show"
  );
  const mediumSelect = document.querySelector(
    ".dom_select.medium ul.dom_select_show"
  );

  campaignSelect.innerHTML = "";
  sourceSelect.innerHTML = "";
  mediumSelect.innerHTML = "";

  // ✅ 1️⃣ Campaign luôn render theo dữ liệu gốc (RAW_DATA)
  const groupedAll = processCRMData(RAW_DATA);
  for (const [campaign, sources] of Object.entries(groupedAll.byCampaign)) {
    const total = Object.values(sources)
      .flatMap((s) => Object.values(s))
      .flat().length;
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
       <span> <span>${campaign}</span>
        <span class="count">${total}</span></span>`;
    li.onclick = () => applyFilter("campaign", campaign);
    campaignSelect.appendChild(li);
  }

  // ✅ 2️⃣ Source & Medium chỉ render từ dữ liệu hiện tại (GROUPED)
  // --- Sources ---
  const sourcesMap = {};
  for (const sources of Object.values(GROUPED.byCampaign)) {
    for (const [src, mediums] of Object.entries(sources)) {
      sourcesMap[src] =
        (sourcesMap[src] || 0) + Object.values(mediums).flat().length;
    }
  }
  for (const [src, count] of Object.entries(sourcesMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
        <span> <span>${src}</span>
        <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("source", src);
    sourceSelect.appendChild(li);
  }

  // --- Mediums ---
  const mediumMap = {};
  for (const sources of Object.values(GROUPED.byCampaign)) {
    for (const mediums of Object.values(sources)) {
      for (const [m, leads] of Object.entries(mediums)) {
        mediumMap[m] = (mediumMap[m] || 0) + leads.length;
      }
    }
  }
  for (const [m, count] of Object.entries(mediumMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
        <span> <span>${m}</span>
        <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("medium", m);
    mediumSelect.appendChild(li);
  }
}
function setupQualityFilter() {
  const qualityList = document.querySelector(
    ".dom_select.quality ul.dom_select_show"
  );
  const selectedEl = document.querySelector(
    ".dom_select.quality .dom_selected"
  );

  qualityList.querySelectorAll("li").forEach((li) => {
    li.onclick = () => {
      const tag = li.querySelector("span:nth-child(2)").textContent.trim();

      // Active UI
      qualityList
        .querySelectorAll("li")
        .forEach((el) => el.classList.remove("active"));
      qualityList
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));
      li.classList.add("active");
      li.querySelector(".radio_box").classList.add("active");

      // Update label
      selectedEl.textContent = tag;

      // ✅ Cập nhật chart (giữ nguyên data hiện tại)
      renderLeadTrendChart(GROUPED, tag);
    };
  });
}

// ============================
// RENDER SOURCE + MEDIUM (theo Campaign hoặc full)
// ============================
function renderSourceAndMedium(selectedCampaign = null) {
  // Nếu không truyền campaign → render All Source + All Medium
  const sourceSelect = document.querySelector(
    ".dom_select.source ul.dom_select_show"
  );
  const mediumSelect = document.querySelector(
    ".dom_select.medium ul.dom_select_show"
  );
  sourceSelect.innerHTML = "";
  mediumSelect.innerHTML = "";

  const campaignsToUse = selectedCampaign
    ? { [selectedCampaign]: grouped.byCampaign[selectedCampaign] }
    : grouped.byCampaign;

  const sourcesMap = {};
  const mediumMap = {};

  for (const sources of Object.values(campaignsToUse)) {
    for (const [src, mediums] of Object.entries(sources)) {
      sourcesMap[src] =
        (sourcesMap[src] || 0) + Object.values(mediums).flat().length;
      for (const [m, leads] of Object.entries(mediums)) {
        mediumMap[m] = (mediumMap[m] || 0) + leads.length;
      }
    }
  }

  // Render Source
  for (const [src, count] of Object.entries(sourcesMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
       <span>
        <span>${src}</span>
        <span class="count">${count}</span>
       </span>`;
    li.onclick = () => {
      applyFilter("source", src);
      renderMedium(selectedCampaign, src);
    };
    sourceSelect.appendChild(li);
  }

  // Render Medium
  for (const [m, count] of Object.entries(mediumMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
        <span class="radio_box"></span>
       <span> <span>${m}</span>
        <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("medium", m);
    mediumSelect.appendChild(li);
  }
}

// ============================
// RENDER MEDIUM (khi chọn source cụ thể)
// ============================
function renderMedium(selectedCampaign, selectedSource) {
  const mediumSelect = document.querySelector(
    ".dom_select.medium ul.dom_select_show"
  );
  mediumSelect.innerHTML = "";

  const campaignData = selectedCampaign
    ? grouped.byCampaign[selectedCampaign]
    : grouped.byCampaign;
  const sources = selectedSource
    ? { [selectedSource]: campaignData[selectedSource] }
    : campaignData;

  const mediumMap = {};

  if (currentFilter.source && !currentFilter.campaign) {
    // ✅ Chỉ chọn Source, chưa chọn Campaign → quét tất cả campaign
    for (const sources of Object.values(GROUPED.byCampaign)) {
      if (!sources[currentFilter.source]) continue;
      const mediums = sources[currentFilter.source];
      for (const [m, leads] of Object.entries(mediums)) {
        mediumMap[m] = (mediumMap[m] || 0) + leads.length;
      }
    }
  } else {
    // ✅ Bình thường (đã chọn Campaign hoặc không chọn gì)
    for (const sources of Object.values(GROUPED.byCampaign)) {
      for (const mediums of Object.values(sources)) {
        for (const [m, leads] of Object.entries(mediums)) {
          mediumMap[m] = (mediumMap[m] || 0) + leads.length;
        }
      }
    }
  }

  for (const [m, count] of Object.entries(mediumMap)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="radio_box"></span>
      <span><span>${m}</span>
      <span class="count">${count}</span></span>`;
    li.onclick = () => applyFilter("medium", m);
    mediumSelect.appendChild(li);
  }
}
function setActiveRadio(type, value) {
  const list = document.querySelector(`.dom_select.${type} ul.dom_select_show`);
  list.querySelectorAll("li").forEach((li) => {
    const name = li.querySelector("span:nth-child(2)").textContent;
    const radio = li.querySelector(".radio_box");
    const isActive = name === value;
    li.classList.toggle("active", isActive);
    radio.classList.toggle("active", isActive);
  });
}

// ============================
// APPLY FILTER + UI ACTIVE
// ============================
function applyFilter(type, value) {
  currentFilter[type] = value;

  // Reset filter con nếu đổi filter cha
  if (type === "campaign") {
    currentFilter.source = null;
    currentFilter.medium = null;
  }
  if (type === "source") {
    currentFilter.medium = null;
  }

  // Cập nhật UI hiển thị
  document.querySelector(`.dom_select.${type} .dom_selected`).textContent =
    value;
  setActiveRadio(type, value);

  // 1️⃣ Lọc lại dữ liệu theo bộ lọc hiện tại
  const filtered = filterLeadsBySelection(RAW_DATA);

  // 2️⃣ Process lại với dữ liệu đã lọc
  GROUPED = processCRMData(filtered);
  window.grouped = GROUPED; // cập nhật global để renderFilterOptions() dùng

  // 3️⃣ Render lại các bộ lọc (con)
  renderFilterOptions();
  renderLeadTrendChart(GROUPED);
  renderToplist(GROUPED);
  renderLeadQualityMeter(GROUPED);
  renderCampaignPieChart(GROUPED);
  renderLeadTable(filtered);
  renderTagFrequency(GROUPED);

  // 4️⃣ Log kết quả / render bảng nếu cần
  console.log("✅ Filtered & regrouped data:", GROUPED);
}

// ============================
// FILTER DATA LOGIC
// ============================
function filterLeadsBySelection(data) {
  return data.filter((lead) => {
    const campaign = lead.CustomField13Text || "Unknown Campaign";
    const source = lead.CustomField14Text || "Unknown Source";
    const medium = lead.CustomField15Text || "Unknown Medium";

    if (currentFilter.campaign && currentFilter.campaign !== campaign)
      return false;
    if (currentFilter.source && currentFilter.source !== source) return false;
    if (currentFilter.medium && currentFilter.medium !== medium) return false;

    return true;
  });
}
function updateLeadCounters(grouped, tagFilter = currentTagFilter) {
  if (!grouped || !grouped.byTag) return;

  const totalLeads = Object.values(grouped.byDate).reduce(
    (sum, d) => sum + (d.total || 0),
    0
  );

  // Tổng số lead thuộc tag đang xem
  const tagLeads = grouped.byTag[tagFilter]
    ? grouped.byTag[tagFilter].length
    : 0;

  const percent =
    totalLeads > 0 ? ((tagLeads / totalLeads) * 100).toFixed(1) : 0;

  // 🧮 Render ra UI
  const countLead = document.getElementById("count_lead");
  const countNeeded = document.getElementById("count_needed");

  if (countLead)
    countLead.querySelector(
      "span"
    ).textContent = `${totalLeads.toLocaleString()}`;

  if (countNeeded)
    countNeeded.querySelector(
      "span"
    ).textContent = `${tagLeads.toLocaleString()} (${percent}%) ${tagFilter}`;
}

// ============================
// CLEAR FILTER
// ============================
function setupClearFilter() {
  const clearBtn = document.querySelector(".clear_filter");
  if (!clearBtn) return;

  clearBtn.onclick = () => {
    console.log("❌ Reset filter: show all");

    // 🔄 Reset biến filter
    currentFilter.campaign = null;
    currentFilter.source = null;
    currentFilter.medium = null;

    // --- Chỉ chọn trong vùng .dom_filter (an toàn, tránh đụng quality)
    const filterArea = document.querySelector(".dom_filter");
    if (!filterArea) return;

    // 🧹 Reset nội dung hiển thị của từng dropdown
    ["campaign", "source", "medium"].forEach((cls) => {
      const select = filterArea.querySelector(`.dom_select.${cls}`);
      if (!select) return;

      const selected = select.querySelector(".dom_selected");
      if (selected) {
        if (cls === "campaign") selected.textContent = "All campaign";
        if (cls === "source") selected.textContent = "All Source";
        if (cls === "medium") selected.textContent = "All Medium";
      }

      // Xóa active trong danh sách chọn của dropdown đó
      select
        .querySelectorAll("li.active")
        .forEach((li) => li.classList.remove("active"));
      select
        .querySelectorAll(".radio_box.active")
        .forEach((r) => r.classList.remove("active"));
    });

    // ✅ Reset lại toàn bộ dữ liệu process
    GROUPED = processCRMData(RAW_DATA);
    window.grouped = GROUPED;

    // ✅ Re-render filter options & chart & counter
    renderFilterOptions();
    renderLeadTrendChart(GROUPED, currentTagFilter);
    updateLeadCounters(GROUPED, currentTagFilter);
    renderToplist(GROUPED);
    renderCampaignPieChart(GROUPED);
    renderTagFrequency(GROUPED);

    renderLeadQualityMeter(GROUPED);
  };
}

// ============================
// DROPDOWN OPEN/CLOSE
// ============================
function formatDisplayDate(from, to) {
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
  return `${fmt(f)} - ${fmt(t)}`;
}

function getDateRange(option) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  let from, to;
  switch (option) {
    case "this_week":
      from = new Date(mondayThisWeek);
      to = new Date(mondayThisWeek);
      to.setDate(from.getDate() + 6);
      break;
    case "last_week":
      from = new Date(mondayThisWeek);
      from.setDate(from.getDate() - 7);
      to = new Date(from);
      to.setDate(from.getDate() + 6);
      break;
    case "this_month":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    default:
      from = new Date(today);
      to = new Date(today);
  }

  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}
function renderAllDashboard(data, grouped) {
  renderFilterOptions();
  renderLeadTrendChart(grouped);
  renderToplist(grouped);
  renderCampaignPieChart(grouped);
  renderLeadTable(data);
  renderTagFrequency(grouped);
  renderLeadQualityMeter(grouped);
}

// Hàm cập nhật UI account khi reset về Total Data
function setActiveAccountUI(accountName) {
  const activeBlock = document.querySelector(
    ".dom_account_view_block .account_item"
  );
  if (!activeBlock) return;

  const accountMap = {
    VTCI: {
      img: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
      id: "CRM Misa",
    },
    IDEAS: {
      img: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
      id: "CRM Misa",
    },
    "Total Data": {
      img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRlIpztniIEN5ZYvLlwwqBvhzdodvu2NfPSbg&s",
      id: "VTCI + IDEAS",
    },
  };

  const acc = accountMap[accountName] || accountMap["Total Data"];
  const avatar = activeBlock.querySelector(".account_item_avatar");
  const name = activeBlock.querySelector(".account_item_name");
  const id = activeBlock.querySelector(".account_item_id");

  avatar.src = acc.img;
  name.textContent = accountName;
  id.textContent = acc.id;
}

function setupAccountFilter() {
  const wrap = document.querySelector(".dom_account_view");
  if (!wrap) return;

  const activeBlock = wrap.querySelector(
    ".dom_account_view_block .account_item"
  );
  const list = wrap.querySelector("ul");
  const items = wrap.querySelectorAll("ul li");

  // 🟢 Mặc định Total Data mỗi lần load
  localStorage.setItem("selectedAccount", "Total Data");
  setActiveAccountUI("Total Data");

  // 🟡 Toggle dropdown
  activeBlock.onclick = (e) => {
    e.stopPropagation();
    list.classList.toggle("active");
  };

  // 🟢 Click chọn account
  items.forEach((li) => {
    li.onclick = async (e) => {
      e.stopPropagation();
      const account = li.querySelector("p span:first-child").textContent.trim();

      localStorage.setItem("selectedAccount", account);
      setActiveAccountUI(account);
      list.classList.remove("active");

      // 🔹 Lọc lại dữ liệu hiện có
      let filtered = RAW_DATA;
      if (account === "VTCI") {
        filtered = RAW_DATA.filter(
          (l) => l.CustomField16Text?.trim().toUpperCase() === "VTCI"
        );
      } else if (account === "IDEAS") {
        filtered = RAW_DATA.filter(
          (l) => l.CustomField16Text?.trim().toUpperCase() === "IDEAS"
        );
      }

      GROUPED = processCRMData(filtered);
      window.grouped = GROUPED;

      renderAllDashboard(filtered, GROUPED);
    };
  });

  // 🔹 Đóng khi click ngoài
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) list.classList.remove("active");
  });
}

function setupTimeDropdown() {
  const timeSelect = document.querySelector(".dom_select.time");
  if (!timeSelect) return;

  const toggle = timeSelect.querySelector(".flex");
  const list = timeSelect.querySelector(".dom_select_show");
  const selectedLabel = timeSelect.querySelector(".dom_selected");
  const dateText = document.querySelector(".dom_date");
  const applyBtn = timeSelect.querySelector(".apply_custom_date");
  const customBox = timeSelect.querySelector(".custom_date");
  const allItems = list.querySelectorAll("li");

  // 🟡 Toggle dropdown
  toggle.onclick = (e) => {
    e.stopPropagation();
    document
      .querySelectorAll(".dom_select_show")
      .forEach((ul) => ul !== list && ul.classList.remove("active"));
    list.classList.toggle("active");
  };

  // 🟢 Chọn preset thời gian
  allItems.forEach((li) => {
    li.onclick = async (e) => {
      e.stopPropagation();
      const type = li.dataset.date;

      if (type === "custom_range") {
        allItems.forEach((i) => i.classList.remove("active"));
        li.classList.add("active");
        customBox.classList.add("show");
        return;
      }

      // reset active
      allItems.forEach((i) => i.classList.remove("active"));
      li.classList.add("active");
      customBox.classList.remove("show");

      const label = li.querySelector("span:last-child").textContent.trim();
      selectedLabel.textContent = label;

      const range = getDateRange(type);
      dateText.textContent = formatDisplayDate(range.from, range.to);

      // ✅ Fetch lại theo ngày
      RAW_DATA = await fetchLeads(range.from, range.to);
      GROUPED = processCRMData(RAW_DATA);
      window.grouped = GROUPED;

      // ✅ Reset account về “Total Data”
      localStorage.setItem("selectedAccount", "Total Data");
      setActiveAccountUI("Total Data");

      // ✅ Render lại dashboard
      renderAllDashboard(RAW_DATA, GROUPED);

      list.classList.remove("active");
    };
  });

  // 🟠 Custom date apply
  applyBtn.onclick = async (e) => {
    e.stopPropagation();
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;

    if (!start || !end)
      return alert("⚠️ Vui lòng chọn đủ ngày bắt đầu và kết thúc!");

    const startDate = new Date(start);
    const endDate = new Date(end);
    const minDate = new Date("2025-10-01");

    if (startDate < minDate)
      return alert("⚠️ Ngày bắt đầu không được trước 01/10/2025!");
    if (endDate <= startDate)
      return alert("⚠️ Ngày kết thúc phải sau ngày bắt đầu!");

    selectedLabel.textContent = "Custom Date";
    dateText.textContent = formatDisplayDate(start, end);

    // ✅ Fetch lại
    RAW_DATA = await fetchLeads(start, end);
    GROUPED = processCRMData(RAW_DATA);
    window.grouped = GROUPED;

    // ✅ Reset account về “Total Data”
    localStorage.setItem("selectedAccount", "Total Data");
    setActiveAccountUI("Total Data");

    renderAllDashboard(RAW_DATA, GROUPED);

    list.classList.remove("active");
    customBox.classList.remove("show");
  };

  // 🔹 Đóng khi click ra ngoài
  document.addEventListener("click", (e) => {
    if (!timeSelect.contains(e.target)) list.classList.remove("active");
  });
}

function setupDropdowns() {
  const selects = document.querySelectorAll(
    ".dom_select:not(.time)" // ⚠️ loại trừ time dropdown
  );

  selects.forEach((sel) => {
    const toggle = sel.querySelector(".flex");
    const list = sel.querySelector(".dom_select_show");

    if (!toggle || !list) return;

    toggle.onclick = (e) => {
      e.stopPropagation();

      // Đóng các dropdown khác
      document.querySelectorAll(".dom_select_show").forEach((u) => {
        if (u !== list) u.classList.remove("active");
      });

      // Toggle dropdown hiện tại
      list.classList.toggle("active");
    };
  });

  // 🔹 Đóng tất cả khi click ngoài
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dom_select")) {
      document
        .querySelectorAll(".dom_select_show")
        .forEach((u) => u.classList.remove("active"));
    }
  });
}

function renderLeadTagChart(grouped) {
  const ctx = document.getElementById("leadTagChart");
  if (!ctx || !grouped?.byTag) return;

  const labels = Object.keys(grouped.byTag);
  const values = labels.map((tag) => grouped.byTag[tag].length);
  const barColors = labels.map(() => "rgba(255, 171, 0, 0.8)");

  // Nếu chart đã tồn tại → chỉ update data
  if (window.leadTagChartInstance) {
    const chart = window.leadTagChartInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update("active");
    return;
  }

  // Nếu chưa có chart → tạo mới
  window.leadTagChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Leads by Tag",
          data: values,
          backgroundColor: barColors,
          borderColor: barColors.map((c) => c.replace("0.8", "1")),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          color: "#003366",
          font: {
            weight: "bold",
            size: 12,
          },
          formatter: (v) => (v > 0 ? v : ""),
          animation: {
            duration: 500,
            easing: "easeOutBack",
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: "rgba(0, 0, 0, 0.05)",
            drawTicks: false,
            drawBorder: false,
          },
          ticks: { font: { size: 12 }, color: "#555" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: "#666",
            stepSize: Math.ceil(Math.max(...values) / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
          grid: { color: "rgba(0, 0, 0, 0.05)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

function renderToplist(grouped) {
  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist");
  if (!wrap || !grouped?.byCampaign) return;

  const list = [];

  // 🧮 Duyệt tất cả Campaign / Source / Medium
  for (const [campaign, sources] of Object.entries(grouped.byCampaign)) {
    for (const [source, mediums] of Object.entries(sources)) {
      for (const [medium, leads] of Object.entries(mediums)) {
        const total = leads.length;

        // Đếm Needed + Considering
        const needed = leads.filter((l) => l.TagMain === "Needed").length;
        const considering = leads.filter(
          (l) => l.TagMain === "Considering"
        ).length;
        const quality = needed + considering;

        const ratio = total > 0 ? (quality / total) * 100 : 0;

        list.push({
          key: `${campaign} - ${source} - ${medium}`,
          total,
          quality,
          ratio: +ratio.toFixed(1),
        });
      }
    }
  }

  // 🔽 Sắp xếp theo tổng lead giảm dần
  list.sort((a, b) => b.total - a.total);

  // 🧹 Xóa nội dung cũ
  wrap.innerHTML = "";

  // 🚀 Render lại danh sách
  for (const item of list) {
    // 🎨 Chọn màu theo ratio
    let barColor = "#00b894"; // mặc định xanh
    if (item.ratio < 20) barColor = "#e17055"; // đỏ
    else if (item.ratio < 40) barColor = "#ffa900"; // vàng

    const html = `
        <li>
          <p>
            <span>${item.key}</span>
            <span>
              <span>${item.quality}/${item.total}</span>
              <span style="color:${barColor}" class="${
      item.ratio >= 40 ? "" : ""
    }">${item.ratio.toFixed(1)}%</span>
            </span>
          </p>
          <p>
            <span class="progress-bar" 
              style="width:${item.ratio}%; background:${barColor};">
            </span>
          </p>
        </li>
      `;
    wrap.insertAdjacentHTML("beforeend", html);
  }
}
function renderCampaignPieChart(grouped) {
  const ctx = document.getElementById("pieCampaign");
  if (!ctx || !grouped?.byCampaign) return;

  const labels = [];
  const values = [];

  // 🧮 Tính tổng lead của từng campaign
  for (const [campaign, sources] of Object.entries(grouped.byCampaign)) {
    let count = 0;
    for (const src of Object.values(sources)) {
      for (const leads of Object.values(src)) {
        count += leads.length;
      }
    }
    labels.push(campaign);
    values.push(count);
  }

  // 🎨 Bảng màu chính + phụ
  const mainPalette = [
    "#262a53", // xanh than
    "#ffa900", // vàng
    "#cccccc", // xám
    "#e17055", // cam
  ];

  const extraPalette = [
    "#74b9ff",
    "#a29bfe",
    "#55efc4",
    "#fab1a0",
    "#fdcb6e",
    "#81ecec",
    "#b2bec3",
  ];

  // ✅ Tạo bảng màu theo số lượng campaign
  const colors = [...mainPalette, ...extraPalette];
  const bgColors = labels.map((_, i) => colors[i % colors.length] + "cc"); // 80% opacity
  const borderColors = labels.map((_, i) => colors[i % colors.length]);
  const total = values.reduce((a, b) => a + b, 0);

  // 🔄 Update nếu chart đã tồn tại
  if (window.campaignPieInstance) {
    const chart = window.campaignPieInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = bgColors;
    chart.data.datasets[0].borderColor = borderColors;
    chart.update("active");
    return;
  }

  // 🚀 Vẽ Pie Chart
  window.campaignPieInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          label: "Campaign Share",
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 10 },
      animation: {
        duration: 900,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          position: "right", // ✅ canh bên phải
          align: "center",
          labels: {
            boxWidth: 14,
            padding: 8,
            color: "#333",
            font: { size: 11, weight: "500" },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed;
              const percent =
                total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${value} (${percent}%)`;
            },
          },
        },
        datalabels: {
          color: "#fff",
          font: { size: 10, weight: "600" },
          formatter: (value) => {
            const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return percent > 3 ? `${percent}%` : "";
          },
          anchor: "end",
          align: "end",
          offset: 4,
          clip: false,
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}
function renderLeadTable(leads) {
  const container = document.querySelector(".dom_table_box");
  if (!container) return;

  if (!Array.isArray(leads) || leads.length === 0) {
    container.innerHTML = `
        <div class="dom_table_container empty">
          <p>Không có dữ liệu để hiển thị</p>
        </div>`;
    return;
  }

  // ====== Cấu trúc cột ======
  const headers = [
    "Created Date",
    "Lead Name",
    "Email",
    "Mobile",
    "Owner",
    "Tags",
    "Campaign",
    "Source",
    "Medium",
    "Organization",
    "Description",
  ];

  // ====== Render body ======
  const rowsHtml = leads
    .map((lead, i) => {
      const {
        CreatedDate,
        LeadName,
        Email,
        Mobile,
        OwnerIDText,
        TagIDText,
        CustomField13Text,
        CustomField14Text,
        CustomField15Text,
        CustomField16Text,
        Description,
      } = lead;

      const date = CreatedDate
        ? new Date(CreatedDate).toLocaleDateString("vi-VN")
        : "-";

      // 🏷️ Xử lý split tag
      let tagHtml = "-";
      if (TagIDText && TagIDText.trim() !== "") {
        const tags = TagIDText.split(",")
          .map((t) => t.trim())
          .filter((t) => t !== "");

        tagHtml = tags
          .map((tag) => {
            // 🎨 Màu tag chính
            let tagClass = "";
            if (tag.includes("Needed")) tagClass = "tag_needed";
            else if (tag.includes("Considering")) tagClass = "tag_considering";
            else if (tag.includes("Bad timing")) tagClass = "tag_bad";
            else if (tag.includes("Unqualified")) tagClass = "tag_unqualified";
            else if (tag.includes("Junk")) tagClass = "tag_junk";
            else tagClass = "tag_other";

            return `<span class="tag_chip ${tagClass}">${tag}</span>`;
          })
          .join(" ");
      }

      return `
          <tr data-id="${i}">
            <td>${date}</td>
            <td>${LeadName || "-"}</td>
            <td>${Email || "-"}</td>
            <td><i class="fa-solid fa-phone table_phone"></i> ${
              Mobile || "-"
            }</td>
            <td>${OwnerIDText || "-"}</td>
            <td>${tagHtml}</td>
            <td>${CustomField13Text || "-"}</td>
            <td>${CustomField14Text || "-"}</td>
            <td>${CustomField15Text || "-"}</td>
            <td>${CustomField16Text || "-"}</td>
            <td>${Description || "-"}</td>
          </tr>
        `;
    })
    .join("");

  // ====== Footer tổng ======
  const footer = `
      <tfoot>
        <tr>
          <td colspan="3">
            <strong>Total: ${leads.length.toLocaleString("en-US")} lead${
    leads.length > 1 ? "s" : ""
  }</strong>
          </td>
             <td colspan="${headers.length - 3}">   </td>
        </tr>
      </tfoot>
    `;

  // ====== Render bảng ======
  container.innerHTML = `
      <div class="dom_table_container">
        <table id="main_table">
          <thead>
            <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          ${footer}
        </table>
      </div>
    `;
}

function renderTagFrequency(grouped) {
  const wrap = document.querySelector(".frequency_tag");
  if (!wrap || !grouped?.tagFrequency) return;

  // Chuyển object {tag: count} → mảng và sort giảm dần
  const list = Object.entries(grouped.tagFrequency)
    .sort((a, b) => b[1] - a[1])
    .filter(
      ([tag]) =>
        ![
          "Needed",
          "Considering",
          "Bad timing",
          "Status - Bad timing",
          "Status - Junk",
          "Qualified",
          "Unqualified",
          "Status - New",
          "Junk",
        ].includes(tag)
    ); // bỏ các tag chính

  // 🧹 Xóa nội dung cũ
  wrap.innerHTML = "";

  // Không có tag phụ thì hiển thị rỗng
  if (list.length === 0) {
    wrap.innerHTML = `<p class="no_tag">Không có tag phụ nào</p>`;
    return;
  }

  // 🎨 Bảng màu chủ đạo
  const colors = [
    "#ffa900", // vàng
    "#262a53", // xanh than
    "#cccccc", // xám
    "#e17055", // cam
    "#74b9ff",
    "#a29bfe",
    "#55efc4",
    "#fab1a0",
    "#fdcb6e",
  ];

  // 🚀 Render từng tag phụ
  for (let i = 0; i < list.length; i++) {
    const [tag, count] = list[i];
    const color = colors[i % colors.length];

    const html = `
        <p class="freq_tag_item" style="--tag-color:${color}">
          <span class="tag_dot" style="background:${color}"></span>
          <span class="tag_name">${tag}</span>
          <span class="tag_count">${count}</span>
        </p>
      `;
    wrap.insertAdjacentHTML("beforeend", html);
  }
}

function renderLeadQualityMeter(grouped) {
  if (!grouped?.byTag) return;

  // 🔢 Tính toán tổng lead và từng nhóm
  const totalLeads = Object.values(grouped.byTag).flat().length;
  const neededCount = grouped.byTag["Needed"]?.length || 0;
  const consideringCount = grouped.byTag["Considering"]?.length || 0;
  const qualityCount = neededCount + consideringCount;

  // 📊 Tính % tổng
  const percent = totalLeads
    ? ((qualityCount / totalLeads) * 100).toFixed(2)
    : 0;
  const neededPercent = totalLeads
    ? ((neededCount / totalLeads) * 100).toFixed(1)
    : 0;
  const consideringPercent = totalLeads
    ? ((consideringCount / totalLeads) * 100).toFixed(1)
    : 0;

  // --- DOM elements ---
  const donut = document.querySelector(".semi-donut");
  const number = donut?.querySelector(".frequency_number");
  const labelNeeded = document.querySelector(".dom_frequency_label_impression");
  const labelConsidering = document.querySelector(".dom_frequency_label_reach");
  const rangeLabel = document.querySelector(".frequency_number_label");

  // --- Update donut (mức độ đầy và màu) ---
  if (donut) donut.style.setProperty("--percentage", percent);
  if (number) number.textContent = `${percent}%`;

  // --- Update labels ---
  if (labelNeeded) labelNeeded.textContent = `${neededPercent}%`;
  if (labelConsidering) labelConsidering.textContent = `${consideringPercent}%`;

  // --- Update dòng tổng số ---
  if (rangeLabel) {
    const [left, right] = rangeLabel.querySelectorAll("p");
    if (left) left.textContent = `${qualityCount}`; // Needed + Considering
    if (right) right.textContent = `${totalLeads}`; // Total lead
  }

  // --- Màu vòng động theo chất lượng ---
  if (donut) {
    let fillColor = "#ffa900"; // mặc định vàng
    if (percent >= 40) fillColor = "#00b894"; // xanh lá khi tốt
    else if (percent <= 20) fillColor = "#e17055"; // đỏ nếu thấp
    donut.style.setProperty("--fill", fillColor);
  }
}

// CHART

function renderLeadTrendChart(grouped, tagFilter = currentTagFilter) {
  currentTagFilter = tagFilter;
  const ctx = document.getElementById("leadTrendChart");
  if (!ctx || !grouped?.byDate) return;

  const dates = Object.keys(grouped.byDate).sort();
  if (dates.length === 0) return;

  const totalCounts = [];
  const tagCounts = [];

  for (const date of dates) {
    const stat = grouped.byDate[date];
    totalCounts.push(stat.total || 0);
    tagCounts.push(stat[tagFilter] || 0);
  }

  const ctx2d = ctx.getContext("2d");
  const gradientTotal = ctx2d.createLinearGradient(0, 0, 0, 400);
  gradientTotal.addColorStop(0, "rgba(255, 171, 0, 0.8)");
  gradientTotal.addColorStop(1, "rgba(255, 171, 0, 0.1)");

  const gradientTag = ctx2d.createLinearGradient(0, 0, 0, 400);
  gradientTag.addColorStop(0, "rgba(38,42,83, 0.8)");
  gradientTag.addColorStop(1, "rgba(38,42,83, 0.1)");

  updateLeadCounters(grouped, currentTagFilter);
  renderLeadTagChart(grouped);

  // Nếu chart đã tồn tại → update
  if (window.leadChartInstance) {
    const chart = window.leadChartInstance;
    chart.data.labels = dates;
    chart.data.datasets[0].data = totalCounts;
    chart.data.datasets[1].data = tagCounts;
    chart.data.datasets[1].label = `${tagFilter} Leads`;
    chart.update("active"); // 🌀 mượt mà
    return;
  }

  // Nếu chưa có chart → khởi tạo mới
  window.leadChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Total Leads",
          data: totalCounts,
          backgroundColor: gradientTotal,
          borderColor: "rgba(255, 171, 0, 1)",
          fill: true,
          tension: 0.1,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          label: `${tagFilter} Leads`,
          data: tagCounts,
          backgroundColor: gradientTag,

          borderColor: "rgba(38,42,83, 1)",
          fill: true,
          tension: 0.1,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: { position: "top", align: "end" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
      },
      scales: {
        x: { ticks: { color: "#555" }, grid: { color: "rgba(0,0,0,0.05)" } },
        y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
      },
    },
  });
}

// ============================
// Khởi tạo sau khi có dữ liệu
// ============================

// Ví dụ dùng:
// document.addEventListener("DOMContentLoaded", function () {
//   window.lastFetchedLeads = []; // biến toàn cục lưu leads
//   const dom_account_view_block = document.querySelector(
//     ".dom_account_view_block"
//   );

//   if (dom_account_view_block) {
//     dom_account_view_block.onclick = () => {
//       dom_account_view_block.classList.add("active");
//     };
//   }

//   function getCampaign(lead) {
//     return (
//       lead.CustomField13Text?.trim() || lead.campaign || "Unknown Campaign"
//     );
//   }
//   function getSource(lead) {
//     return lead.CustomField14Text?.trim() || lead.source || "Unknown Source";
//   }
//   function getMedium(lead) {
//     return lead.CustomField15Text?.trim() || lead.medium || "Unknown Medium";
//   }
//   function updateLeadCount(leads, tagFilter = "Needed") {
//     // 🧩 Xử lý tag tránh lỗi [object Object]
//     const tag =
//       typeof tagFilter === "string"
//         ? tagFilter
//         : (tagFilter?.toString?.() || "Needed").toString();

//     console.log("🟢 updateLeadCount called with tag =", tag);

//     // 🧮 Tính toán số lượng
//     const total = Array.isArray(leads) ? leads.length : Number(leads) || 0;
//     const tagCount = Array.isArray(leads)
//       ? leads.filter((l) => getMainTag(l) === tag).length
//       : 0;

//     const percent = total ? ((tagCount / total) * 100).toFixed(1) : 0;

//     // 🎨 Màu tương ứng theo tag
//     const tagColors = {
//       Needed: "rgba(255, 146, 146, 1)", // đỏ hồng
//       Considering: "rgba(255, 206, 86, 1)", // vàng
//       "Bad timing": "rgba(54, 162, 235, 1)", // xanh dương
//       Unqualified: "rgba(153, 102, 255, 1)", // tím
//       Junk: "rgba(201, 203, 207, 1)", // xám nhạt
//       Default: "rgba(100, 100, 100, 0.7)", // fallback
//     };

//     const bgColor = tagColors[tag] || tagColors.Default;

//     // 🧮 Cập nhật tổng lead
//     const leadEl = document.querySelector("#count_lead span");
//     if (leadEl) leadEl.textContent = total.toLocaleString("en-US");

//     // 🧮 Cập nhật tag count + %
//     const neededWrap = document.querySelector("#count_needed");
//     const neededEl = neededWrap?.querySelector("span");
//     if (neededEl) {
//       neededEl.textContent = `${tag}: ${tagCount.toLocaleString(
//         "en-US"
//       )} (${percent}%)`;
//     }

//     // 🎨 Đổi background #count_needed đồng bộ màu tag
//     if (neededWrap) {
//       neededWrap.style.backgroundColor = bgColor;
//     }
//   }

//   const TAG_PRIORITY = [
//     "Needed",
//     "Qualified",
//     "Considering",
//     "Bad timing",
//     "Unqualified",
//     "Junk",
//     "New",
//     "Uknow",
//   ];
//   function attachAccountFilter(leads) {
//     const wrap = document.querySelector(".dom_account_view");
//     if (!wrap) return;

//     const activeBlock = wrap.querySelector(".dom_account_view_block");
//     const accountList = wrap.querySelectorAll("ul li");

//     // Lấy trạng thái cũ từ localStorage
//     let savedAccount = localStorage.getItem("selectedAccount") || "Total Data";

//     // Nếu có tài khoản được lưu → kích hoạt lại
//     const savedLi = Array.from(accountList).find((li) =>
//       li.textContent.includes(savedAccount)
//     );
//     if (savedLi) setActiveAccount(savedLi, savedAccount, leads);

//     // Gắn sự kiện click cho từng item
//     accountList.forEach((li) => {
//       li.onclick = () => {
//         const accountName =
//           li.querySelector("p span:first-child")?.textContent.trim() ||
//           "Total Data";

//         // Lưu lại lựa chọn
//         localStorage.setItem("selectedAccount", accountName);

//         // Đóng dropdown
//         wrap.classList.remove("active");

//         // Gọi cập nhật UI + filter
//         setActiveAccount(li, accountName, leads);
//       };
//     });

//     // Toggle danh sách khi click vào khối trên
//     activeBlock.onclick = (e) => {
//       e.stopPropagation();
//       activeBlock.classList.toggle("active");
//     };
//     document.addEventListener("click", () =>
//       activeBlock.classList.remove("active")
//     );

//     // ========== Hàm chính: cập nhật khi chọn account ==========
//     function setActiveAccount(li, accountName, leads) {
//       // ✅ Cập nhật hiển thị khối account_item phía trên
//       const name =
//         li.querySelector("p span:first-child")?.textContent || "Total Data";
//       const id = li.querySelector("p span:last-child")?.textContent || "";
//       const avatar = li.querySelector("img")?.src || "";

//       activeBlock.innerHTML = `
//         <div class="account_item">
//           <div>
//             <img class="account_item_avatar" src="${avatar}" />
//             <div class="account_item_info">
//               <p class="account_item_name">${name}</p>
//               <p class="account_item_id">${id}</p>
//             </div>
//           </div>
//           <i class="fa-solid fa-sort"></i>
//         </div>
//       `;

//       // ✅ Lọc theo account
//       let filteredLeads =
//         accountName === "Total Data"
//           ? leads
//           : leads.filter(
//               (l) =>
//                 l.CustomField16Text?.trim()?.toLowerCase() ===
//                 accountName.toLowerCase()
//             );

//       // ✅ Reset filter state (All Campaign / All Source / All Medium)
//       window.selectedCampaign = "__ALL__";
//       window.selectedSource = "__ALL__";
//       window.selectedMedium = "__ALL__";
//       document.querySelector(".dom_select.campaign .dom_selected").textContent =
//         "All Campaign";
//       document.querySelector(".dom_select.source .dom_selected").textContent =
//         "All Source";
//       document.querySelector(".dom_select.medium .dom_selected").textContent =
//         "All Medium";

//       // ✅ Cập nhật dropdown theo dữ liệu account
//       window.groupedAll = groupLeadsByCampaign(filteredLeads);
//       buildCampaignDropdown();
//       buildSourceDropdown("__ALL__");
//       buildMediumDropdown("__ALL__", "__ALL__");

//       // ✅ Render lại toàn bộ giao diện
//       renderLeadTagChart(filteredLeads);
//       renderLeadTrendChart(filteredLeads);
//       renderToplistByNeeded(filteredLeads);
//       renderLeadTable(filteredLeads);
//       attachQualityDropdown(filteredLeads);
//       updateLeadCount(filteredLeads, "Needed");
//     }
//     setTimeout(() => {
//       const savedAcc = localStorage.getItem("selectedAccount") || "Total Data";
//       const li = Array.from(accountList).find((el) =>
//         el.textContent.includes(savedAcc)
//       );
//       if (li) li.click(); // ép render đúng data theo account
//     }, 0);
//   }

//   // 🔹 Hàm lấy tag chính theo ưu tiên
//   function getMainTag(lead) {
//     if (!lead || !lead.TagIDText) return "Uknow";

//     const tags = lead.TagIDText.split(",")
//       .map((t) =>
//         t
//           .replace(/^0\.\s*/, "") // bỏ prefix "0. "
//           .trim()
//           .toLowerCase()
//       )
//       .filter(Boolean);

//     // Ưu tiên cao → thấp
//     for (const pri of TAG_PRIORITY) {
//       if (tags.some((t) => t.includes(pri.toLowerCase()))) {
//         // Gộp Qualified vào Needed
//         if (pri === "Qualified") return "Needed";
//         return pri;
//       }
//     }

//     return "Uknow";
//   }

//   // 🔹 Hàm đếm số lượng lead theo tag chính
//   function countLeadsByTag(leads) {
//     // Tạo object đếm mặc định
//     const counts = {
//       Needed: 0,
//       Considering: 0,
//       "Bad timing": 0,
//       Unqualified: 0,
//       Junk: 0,
//       New: 0,
//       Uknow: 0,
//     };

//     leads.forEach((lead) => {
//       const tag = getMainTag(lead);
//       // Gộp Qualified → Needed khi cộng
//       const group = tag === "Qualified" ? "Needed" : tag;
//       counts[group] = (counts[group] || 0) + 1;
//     });

//     return counts;
//   }

//   function groupLeadsByTag(leads) {
//     const grouped = {};
//     leads.forEach((lead) => {
//       const tag = getMainTag(lead);
//       if (!grouped[tag]) grouped[tag] = [];
//       grouped[tag].push(lead);
//     });
//     return grouped;
//   }

//   function groupLeadsByDate(leads) {
//     const grouped = {};

//     leads.forEach((lead) => {
//       // 🔹 Lấy ngày hợp lệ (YYYY-MM-DD)
//       let dateStr =
//         lead.CreatedDate?.split("T")[0] ||
//         lead.CreatedDateText?.split("T")[0] ||
//         lead.created_at?.split("T")[0] ||
//         lead.created ||
//         null;
//       if (!dateStr) return;

//       // Chuẩn hóa định dạng
//       const d = new Date(dateStr);
//       if (isNaN(d)) return;
//       const y = d.getFullYear();
//       const m = String(d.getMonth() + 1).padStart(2, "0");
//       const day = String(d.getDate()).padStart(2, "0");
//       const key = `${y}-${m}-${day}`;

//       // Lấy tag chính
//       const tag = getMainTag(lead);

//       // 🔸 Nếu chưa có ngày đó → khởi tạo
//       if (!grouped[key]) {
//         grouped[key] = { total: 0 };
//       }

//       // Tăng tổng lead
//       grouped[key].total++;

//       // Tăng theo từng tag
//       if (!grouped[key][tag]) grouped[key][tag] = 0;
//       grouped[key][tag]++;
//     });

//     // 🔹 Sắp xếp theo ngày
//     const sortedKeys = Object.keys(grouped).sort();
//     return sortedKeys.map((date) => ({
//       date,
//       ...grouped[date],
//     }));
//   }

//   // Nhóm dữ liệu theo Campaign → Source → Medium
//   function groupLeadsByCampaign(leads) {
//     const grouped = {};
//     leads.forEach((lead) => {
//       const campaign = getCampaign(lead);
//       const source = getSource(lead);
//       const medium = getMedium(lead);

//       if (!grouped[campaign]) grouped[campaign] = {};
//       if (!grouped[campaign][source]) grouped[campaign][source] = {};
//       if (!grouped[campaign][source][medium])
//         grouped[campaign][source][medium] = [];

//       grouped[campaign][source][medium].push(lead);
//     });
//     return grouped;
//   }
//   // CHART
//   let leadChartInstance = null;
//   let currentTagFilter = "Needed"; // mặc định

//   function renderLeadTrendChart(leads, tagFilter = currentTagFilter) {
//     currentTagFilter = tagFilter;

//     const ctx = document.getElementById("leadTrendChart");
//     if (!ctx) return;

//     const grouped = groupLeadsByDate(leads);
//     if (grouped.length === 0) return;

//     const dates = grouped.map((g) => g.date);
//     const totalCounts = grouped.map((g) => g.total || 0);
//     const tagCounts = grouped.map((g) => g[tagFilter] || 0);

//     const ctx2d = ctx.getContext("2d");

//     // 🎨 Màu gradient cho từng loại tag
//     const tagColors = {
//       Needed: ["rgba(255, 146, 146, 0.8)", "rgba(255, 146, 146, 0.1)"], // đỏ hồng
//       Considering: ["rgba(255, 206, 86, 0.8)", "rgba(255, 206, 86, 0.1)"], // vàng nhạt
//       "Bad timing": ["rgba(54, 162, 235, 0.8)", "rgba(54, 162, 235, 0.1)"], // xanh dương
//       Unqualified: ["rgba(153, 102, 255, 0.8)", "rgba(153, 102, 255, 0.1)"], // tím
//       Junk: ["rgba(201, 203, 207, 0.8)", "rgba(201, 203, 207, 0.1)"], // xám nhạt
//       Default: ["rgba(100, 100, 100, 0.6)", "rgba(100, 100, 100, 0.1)"], // fallback
//     };

//     const [tagTop, tagBottom] = tagColors[tagFilter] || tagColors.Default;

//     // Gradient màu tổng (Total Leads)
//     const gradientTotal = ctx2d.createLinearGradient(0, 0, 0, 400);
//     gradientTotal.addColorStop(0, "rgba(255, 171, 0, 0.8)");
//     gradientTotal.addColorStop(1, "rgba(255, 171, 0, 0.1)");

//     // Gradient màu tag (tùy theo tagFilter)
//     const gradientTag = ctx2d.createLinearGradient(0, 0, 0, 400);
//     gradientTag.addColorStop(0, tagTop);
//     gradientTag.addColorStop(1, tagBottom);

//     // 🔄 Xóa chart cũ
//     if (leadChartInstance) leadChartInstance.destroy();

//     // 🚀 Vẽ chart
//     leadChartInstance = new Chart(ctx, {
//       type: "line",
//       data: {
//         labels: dates,
//         datasets: [
//           {
//             label: "Total Leads",
//             data: totalCounts,
//             backgroundColor: gradientTotal,
//             borderColor: "rgba(255, 171, 0, 1)",
//             fill: true,
//             tension: 0.25,
//             pointRadius: 3,
//             pointHoverRadius: 6,
//           },
//           {
//             label: `${tagFilter} Leads`,
//             data: tagCounts,
//             backgroundColor: gradientTag,
//             borderColor: tagTop.replace("0.8", "1"), // cùng màu border
//             fill: true,
//             tension: 0.25,
//             pointRadius: 3,
//             pointHoverRadius: 6,
//           },
//         ],
//       },
//       options: {
//         responsive: true,
//         maintainAspectRatio: false,
//         animation: { duration: 700, easing: "easeOutQuart" },
//         plugins: {
//           legend: { position: "top", align: "end" },
//           tooltip: {
//             callbacks: {
//               label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
//             },
//           },
//         },
//         scales: {
//           x: {
//             grid: {
//               display: true,
//               color: "rgba(0, 0, 0, 0.05)",
//               drawTicks: false,
//               drawBorder: false,
//             },
//             ticks: { color: "#555", font: { size: 12 } },
//           },
//           y: {
//             beginAtZero: true,
//             ticks: {
//               color: "#555",
//               font: { size: 12 },
//               precision: 0,
//               maxTicksLimit: 5,
//               callback: (v) => v.toLocaleString("en-US"),
//             },
//             grid: { color: "rgba(0, 0, 0, 0.05)" },
//           },
//         },
//         elements: {
//           line: { borderWidth: 2 },
//           point: { hoverBorderWidth: 2, hoverBorderColor: "#fff" },
//         },
//       },
//     });
//   }

//   function attachQualityDropdown(leads) {
//     const wrap = document.querySelector(".dom_select.quality");
//     if (!wrap) return;

//     const label = wrap.querySelector(".dom_selected");
//     const menu = wrap.querySelector(".dom_select_show");
//     const header = wrap.querySelector(".flex");

//     // 🟡 Toggle menu khi click header
//     header.onclick = (e) => {
//       e.stopPropagation();
//       document
//         .querySelectorAll(".dom_select")
//         .forEach((s) => s !== wrap && s.classList.remove("active"));
//       wrap.classList.toggle("active");
//     };

//     // 🟢 Click chọn từng tag
//     menu.querySelectorAll("li").forEach((li) => {
//       li.onclick = () => {
//         const tag =
//           li.querySelector("span:last-child")?.textContent.trim() || "Needed";

//         // Update UI
//         menu
//           .querySelectorAll("li")
//           .forEach((i) => i.classList.remove("active"));
//         li.classList.add("active");
//         label.textContent = tag;
//         wrap.classList.remove("active");

//         // Render lại chart + count
//         renderLeadTrendChart(leads, tag);
//         updateLeadCount(leads, tag);
//       };
//     });

//     // 🟠 Đóng menu khi click ngoài
//     document.onclick = (e) => {
//       if (!wrap.contains(e.target)) wrap.classList.remove("active");
//     };

//     // 🟢 Khởi tạo mặc định “Needed”
//     const defaultTag = "Needed";
//     label.textContent = defaultTag;

//     const defaultLi = Array.from(menu.querySelectorAll("li")).find((li) =>
//       li.textContent.trim().toLowerCase().includes(defaultTag.toLowerCase())
//     );
//     if (defaultLi) {
//       menu.querySelectorAll("li").forEach((i) => i.classList.remove("active"));
//       defaultLi.classList.add("active");
//     }

//     // 🧭 Render chart & count mặc định
//     renderLeadTrendChart(leads, defaultTag);
//     updateLeadCount(leads, defaultTag);
//   }

//   let leadTagChartInstance = null;

//   function renderLeadTagChart(leads) {
//     const ctx = document.getElementById("leadTagChart");
//     if (!ctx) return;

//     const counts = countLeadsByTag(leads);
//     const labels = Object.keys(counts);
//     const values = Object.values(counts);

//     // 🎨 Màu riêng cho từng tag
//     const tagColors = {
//       Needed: "rgba(255, 99, 132, 1)", // vàng cam
//       Qualified: "rgba(255, 171, 0, 1)",
//       Considering: "rgb(54, 235, 226)", // xanh dương
//       "Bad timing": "rgba(153, 102, 255, 1)", // đỏ hồng
//       Unqualified: "rgb(176, 196, 0)", // tím
//       Junk: "rgb(87, 87, 87)", // xám
//       New: "rgb(233, 93, 0)", // xanh ngọc
//       Uknow: "rgb(189, 189, 189)", // xám nhạt
//     };

//     // Gán màu cho từng tag
//     const barColors = labels.map(
//       (tag) => tagColors[tag] || "rgba(200,200,200,0.5)"
//     );

//     // Xóa chart cũ nếu có
//     if (window.leadTagChartInstance) window.leadTagChartInstance.destroy();

//     // 🚀 Tạo bar chart
//     window.leadTagChartInstance = new Chart(ctx, {
//       type: "bar",
//       data: {
//         labels,
//         datasets: [
//           {
//             label: "Leads by Tag",
//             data: values,
//             backgroundColor: barColors,
//             borderColor: barColors.map((c) => c.replace("0.8", "1")),
//             borderWidth: 1,
//             borderRadius: 6,
//           },
//         ],
//       },
//       options: {
//         responsive: true,
//         maintainAspectRatio: false,
//         plugins: {
//           legend: { display: false },
//           tooltip: {
//             callbacks: {
//               label: (ctx) => `${ctx.parsed.y} leads`,
//             },
//           },
//           datalabels: {
//             anchor: "end",
//             align: "end",
//             color: "#444",
//             font: {
//               weight: "bold",
//               size: 12,
//             },
//             formatter: (value) => (value > 0 ? value : ""),
//           },
//         },
//         scales: {
//           x: {
//             grid: {
//               display: true, // ✅ sọc đứng
//               color: "rgba(0, 0, 0, 0.05)",
//               lineWidth: 1,
//               drawTicks: false,
//               drawBorder: false,
//             },
//             ticks: {
//               font: { size: 12 },
//               color: "#555",
//             },
//           },
//           y: {
//             beginAtZero: true,
//             ticks: {
//               font: { size: 11 },
//               color: "#666",
//               stepSize: Math.ceil(Math.max(...values) / 4) || 1,
//               callback: function (value) {
//                 return value >= 1000 ? (value / 1000).toFixed(0) + "k" : value;
//               },
//             },
//             afterDataLimits: (scale) => {
//               scale.max *= 1.1; // tăng 10%
//             },
//             grid: {
//               color: "rgba(0, 0, 0, 0.05)",
//             },
//           },
//         },
//       },
//       plugins: [ChartDataLabels],
//     });
//   }

//   function renderToplistByNeeded(leads) {
//     const list = document.querySelector(".dom_toplist");
//     if (!list) return;

//     // Nhóm theo Campaign → Source → Medium
//     const grouped = {};
//     leads.forEach((lead) => {
//       const campaign = getCampaign(lead);
//       const source = getSource(lead);
//       const medium = getMedium(lead);
//       const key = `${campaign} - ${source} - ${medium}`;

//       if (!grouped[key]) grouped[key] = [];
//       grouped[key].push(lead);
//     });

//     // Tính số Needed và tổng
//     const stats = Object.keys(grouped).map((key) => {
//       const arr = grouped[key];
//       const total = arr.length;
//       const neededCount = arr.filter((l) => getMainTag(l) === "Needed").length;
//       const percent = total ? ((neededCount / total) * 100).toFixed(1) : 0;
//       return { key, neededCount, total, percent: parseFloat(percent) };
//     });

//     // ✅ Sắp xếp: NeededCount > % Needed > Total
//     stats.sort((a, b) => {
//       if (b.neededCount !== a.neededCount) return b.neededCount - a.neededCount;
//       if (b.percent !== a.percent) return b.percent - a.percent;
//       return b.total - a.total;
//     });

//     // Render tối đa 10 dòng
//     list.innerHTML = stats
//       .slice(0, 10)
//       .map((item) => {
//         const highlightClass = item.percent >= 50 ? "main_bg" : "";
//         return `
//       <li>
//         <p>
//           <span>${item.key}</span>
//           <span>
//             <span>${item.neededCount}/${item.total}</span>
//             <span class="${highlightClass}">${item.percent}%</span>
//           </span>
//         </p>
//         <p>
//           <span class="progress-bar" style="width:${item.percent}%;"></span>
//         </p>
//       </li>
//     `;
//       })
//       .join("");
//   }
//   // ============ GLOBAL STATE ============
//   window.leadAll = [];
//   window.groupedAll = {};
//   window.currentRange = null;
//   const loading = document.querySelector(".loading");
//   const domDateEl = document.querySelector(".dom_date");
//   const clearBtn = document.querySelector(".clear_filter");

//   // ============ HELPER FUNCTIONS ============
//   // ============ HELPER FUNCTIONS ============
//   // Lấy tên campaign, source, medium từ custom field của MISA
//   // 🗓️ Nhóm lead theo ngày

//   const uniq = (arr) =>
//     [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b));
//   const escapeHtml = (s = "") =>
//     String(s).replace(
//       /[&<>"']/g,
//       (c) =>
//         ({
//           "&": "&amp;",
//           "<": "&lt;",
//           ">": "&gt;",
//           '"': "&quot;",
//           "'": "&#39;",
//         }[c])
//     );
//   const parseYMD = (s) => {
//     const [Y, M, D] = s.split("-").map(Number);
//     return new Date(Y, M - 1, D);
//   };
//   const toDMY = (d) =>
//     `${String(d.getDate()).padStart(2, "0")}/${String(
//       d.getMonth() + 1
//     ).padStart(2, "0")}/${d.getFullYear()}`;

//   // ============ MAIN ENTRY ============
//   function setLeadAll(leads) {
//     window.leadAll = Array.isArray(leads) ? leads : [];
//     window.groupedAll = groupLeadsByCampaign(window.leadAll);
//     buildCampaignDropdown();
//   }
//   function renderLeadTable(leads) {
//     const container = document.querySelector(".dom_table_box");
//     if (!container) return;

//     if (!Array.isArray(leads) || leads.length === 0) {
//       container.innerHTML = `<div class="dom_table_container empty"><p>Không có dữ liệu để hiển thị</p></div>`;
//       return;
//     }

//     // ====== Xây header ======
//     const headers = [
//       "Created Date",
//       "Lead Name",
//       "Email",
//       "Mobile",
//       "Owner",
//       "Tag",
//       "Campaign",
//       "Source",
//       "Medium",
//       "Description",
//     ];

//     // ====== Render body ======
//     const rowsHtml = leads
//       .map((lead, i) => {
//         const {
//           CreatedDate,
//           LeadName,
//           Email,
//           Mobile,
//           OwnerIDText,
//           TagIDText,
//           CustomField13Text,
//           CustomField14Text,
//           CustomField15Text,
//           Description,
//         } = lead;

//         return `
//           <tr data-id="${i}">
//             <td>${
//               CreatedDate
//                 ? new Date(CreatedDate).toLocaleDateString("vi-VN")
//                 : "-"
//             }</td>
//             <td>${LeadName || "-"}</td>
//             <td>${Email || "-"}</td>
//             <td>${Mobile || "-"}</td>
//             <td>${OwnerIDText || "-"}</td>
//             <td>${TagIDText || "-"}</td>
//             <td>${CustomField13Text || "-"}</td>
//             <td>${CustomField14Text || "-"}</td>
//             <td>${CustomField15Text || "-"}</td>
//             <td>${Description || "-"}</td>
//           </tr>
//         `;
//       })
//       .join("");

//     // ====== Render footer (tổng dòng) ======
//     const footer = `
//       <tfoot>
//         <tr>  <td></td>
//           <td colspan="${headers.length}">
//             <strong>Total ${leads.length.toLocaleString("en-US")} Row${
//       leads.length > 1 ? "s" : ""
//     }</strong>
//           </td>
//         </tr>
//       </tfoot>
//     `;

//     // ====== Render bảng hoàn chỉnh ======
//     container.innerHTML = `
//       <div class="dom_table_container">
//         <table id="main_table">
//           <thead>
//             <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
//           </thead>
//           <tbody>${rowsHtml}</tbody>
//           ${footer}
//         </table>
//       </div>
//     `;
//   }

//   // ============ BUILD DROPDOWN CẤP 1 ============
//   function buildCampaignDropdown() {
//     const wrap = document.querySelector(".dom_select.campaign");
//     const campaigns = Object.keys(window.groupedAll);
//     const options = campaigns.map(
//       (k) => `${k} (${countAll(window.groupedAll[k])})`
//     );

//     buildOptions(wrap, "All Campaign", options, (value) => {
//       window.selectedCampaign = value.split(" (")[0];

//       // 🔸 Reset Source & Medium
//       window.selectedSource = "__ALL__";
//       window.selectedMedium = "__ALL__";

//       // Cập nhật label UI
//       const sourceWrap = document.querySelector(".dom_select.source");
//       const mediumWrap = document.querySelector(".dom_select.medium");
//       if (sourceWrap)
//         sourceWrap.querySelector(".dom_selected").textContent = "All Source";
//       if (mediumWrap)
//         mediumWrap.querySelector(".dom_selected").textContent = "All Medium";

//       // Xóa trạng thái active của 2 dropdown con
//       document
//         .querySelectorAll(".dom_select.source li, .dom_select.medium li")
//         .forEach((li) => li.classList.remove("active"));

//       // 🔹 Build lại 2 dropdown con
//       buildSourceDropdown(window.selectedCampaign);
//       buildMediumDropdown(window.selectedCampaign, "__ALL__");

//       // 🔹 Render lại dữ liệu
//       renderFilteredLeads();
//     });
//   }

//   // ============ BUILD DROPDOWN CẤP 2 ============
//   function buildSourceDropdown(campaign) {
//     const wrap = document.querySelector(".dom_select.source");
//     let sources = [];

//     if (campaign && campaign !== "__ALL__") {
//       const srcObj = window.groupedAll[campaign] || {};
//       sources = Object.keys(srcObj).map((k) => `${k} (${countAll(srcObj[k])})`);
//     } else {
//       // Union tất cả source
//       for (const c of Object.keys(window.groupedAll)) {
//         const srcObj = window.groupedAll[c];
//         for (const s of Object.keys(srcObj)) {
//           sources.push(`${s} (${countAll(srcObj[s])})`);
//         }
//       }
//     }

//     buildOptions(wrap, "All Source", uniq(sources), (value) => {
//       window.selectedSource = value.split(" (")[0];

//       // 🔸 Reset Medium
//       window.selectedMedium = "__ALL__";

//       const mediumWrap = document.querySelector(".dom_select.medium");
//       if (mediumWrap)
//         mediumWrap.querySelector(".dom_selected").textContent = "All Medium";

//       document
//         .querySelectorAll(".dom_select.medium li")
//         .forEach((li) => li.classList.remove("active"));

//       // 🔹 Build lại Medium dropdown
//       buildMediumDropdown(window.selectedCampaign, window.selectedSource);

//       // 🔹 Render lại dữ liệu
//       renderFilteredLeads();
//     });

//     // Reset label hiển thị
//     wrap.querySelector(".dom_selected").textContent = "All Source";
//   }

//   // ============ BUILD DROPDOWN CẤP 3 ============
//   function buildMediumDropdown(campaign, source) {
//     const wrap = document.querySelector(".dom_select.medium");
//     let mediums = [];
//     if (campaign && source && campaign !== "__ALL__" && source !== "__ALL__") {
//       const medObj = window.groupedAll[campaign]?.[source] || {};
//       mediums = Object.keys(medObj).map((k) => `${k} (${medObj[k].length})`);
//     } else {
//       for (const c of Object.keys(window.groupedAll)) {
//         for (const s of Object.keys(window.groupedAll[c])) {
//           const medObj = window.groupedAll[c][s];
//           for (const m of Object.keys(medObj)) {
//             mediums.push(`${m} (${medObj[m].length})`);
//           }
//         }
//       }
//     }
//     buildOptions(wrap, "All Medium", uniq(mediums), (value) => {
//       window.selectedMedium = value.split(" (")[0];
//       renderFilteredLeads();
//     });
//     wrap.querySelector(".dom_selected").textContent = "All Medium";
//   }

//   // ============ TÍNH TỔNG SỐ LEAD ============
//   function countAll(obj) {
//     let count = 0;
//     for (const s of Object.keys(obj)) {
//       if (Array.isArray(obj[s])) count += obj[s].length;
//       else count += countAll(obj[s]);
//     }
//     return count;
//   }

//   // ============ BUILD OPTION CHUNG ============
//   function buildOptions(wrap, allLabel, values, onSelect) {
//     const ul = wrap.querySelector(".dom_select_show");
//     const label = wrap.querySelector(".dom_selected");
//     const header = wrap.querySelector(".flex");
//     if (!ul || !label || !header) return;

//     // 🧹 Xây danh sách item
//     const items = [
//       `<li class="active" data-value="__ALL__">
//           <span class="radio_box"></span><span>${allLabel}</span>
//        </li>`,
//       ...values.map(
//         (v) =>
//           `<li data-value="${escapeHtml(v)}">
//               <span class="radio_box"></span><span>${escapeHtml(v)}</span>
//            </li>`
//       ),
//     ];
//     ul.innerHTML = items.join("");
//     label.textContent = allLabel;

//     // 🟢 Gắn onclick cho từng item
//     const listItems = ul.querySelectorAll("li");
//     listItems.forEach((li) => {
//       li.onclick = () => {
//         // Cập nhật trạng thái active
//         listItems.forEach((i) => i.classList.remove("active"));
//         li.classList.add("active");

//         // Cập nhật label hiển thị
//         label.textContent =
//           li.querySelector("span:last-child")?.textContent.trim() || allLabel;

//         // Đóng dropdown
//         wrap.classList.remove("active");

//         // Gọi callback (trả về data-value hoặc "__ALL__")
//         const value = li.dataset.value || "__ALL__";
//         onSelect?.(value);
//       };
//     });

//     // 🟡 Toggle hiển thị menu khi click header
//     header.onclick = (e) => {
//       e.stopPropagation();
//       document
//         .querySelectorAll(".dom_select")
//         .forEach((s) => s !== wrap && s.classList.remove("active"));
//       wrap.classList.toggle("active");
//     };

//     // 🟠 Đóng menu khi click ra ngoài
//     document.onclick = (e) => {
//       if (!wrap.contains(e.target)) wrap.classList.remove("active");
//     };
//   }

//   // ============ RENDER SAU KHI LỌC ============
//   function renderFilteredLeads() {
//     let data = window.leadAll;
//     const c = window.selectedCampaign;
//     const s = window.selectedSource;
//     const m = window.selectedMedium;

//     if (c && c !== "__ALL__") data = data.filter((x) => getCampaign(x) === c);
//     if (s && s !== "__ALL__") data = data.filter((x) => getSource(x) === s);
//     if (m && m !== "__ALL__") data = data.filter((x) => getMedium(x) === m);

//     // 🔹 Nhóm theo tag chính
//     const groupedByTag = groupLeadsByTag(data);

//     console.groupCollapsed(
//       `Filtered Result → Campaign: ${c || "All"}, Source: ${
//         s || "All"
//       }, Medium: ${m || "All"}`
//     );
//     console.log("📊 Total:", data.length);
//     console.table(
//       data.map((x, i) => ({
//         STT: i + 1,
//         Name: x.FullName || x.Name || "-",
//         Phone: x.Phone || "-",
//         Tag: getMainTag(x),
//         Campaign: x.CustomField13Text || "-",
//         Source: x.CustomField14Text || "-",
//         Medium: x.CustomField15Text || "-",
//         CreatedDate: x.CreatedDate || "-",
//       }))
//     );
//     console.log("Grouped by Tag:", groupedByTag);
//     console.groupEnd();

//     // 🔹 Cập nhật UI
//     attachQualityDropdown(data);
//     renderLeadTagChart(data);
//     renderToplistByNeeded(data);
//     renderLeadTable(data);

//     // 🧮 (nếu muốn chart tag hoặc tỷ lệ tag, có thể thêm ở đây)
//   }

//   // ============ CLEAR FILTER ============
//   if (clearBtn) {
//     clearBtn.onclick = () => {
//       // 🧭 Reset state
//       window.selectedCampaign = "__ALL__";
//       window.selectedSource = "__ALL__";
//       window.selectedMedium = "__ALL__";

//       // 🔒 Đóng tất cả dropdowns đang mở
//       document
//         .querySelectorAll(".dom_select")
//         .forEach((s) => s.classList.remove("active"));

//       // 🧹 Reset label & trạng thái active cho dropdowns
//       const dropdowns = [
//         { selector: ".dom_select.campaign", text: "All Campaign" },
//         { selector: ".dom_select.source", text: "All Source" },
//         { selector: ".dom_select.medium", text: "All Medium" },
//       ];

//       dropdowns.forEach((d) => {
//         const wrap = document.querySelector(d.selector);
//         if (!wrap) return;

//         // Reset label text
//         const label = wrap.querySelector(".dom_selected");
//         if (label) label.textContent = d.text;

//         // Reset active state
//         const lis = wrap.querySelectorAll("li");
//         lis.forEach((li) => li.classList.remove("active"));
//         const first = wrap.querySelector("li:first-child");
//         if (first) first.classList.add("active");
//       });

//       // 🌀 Rebuild lại dropdowns dựa trên dữ liệu gốc
//       window.groupedAll = groupLeadsByCampaign(window.leadAll);
//       buildCampaignDropdown();
//       buildSourceDropdown("__ALL__");
//       buildMediumDropdown("__ALL__", "__ALL__");

//       // 🔁 Hiển thị lại toàn bộ leads
//       renderFilteredLeads();

//       // 📊 Reset lại biểu đồ & đếm tag
//       updateLeadCount(window.leadAll, "Needed");
//       renderLeadTrendChart(window.leadAll, "Needed");

//       // 🎯 Gắn lại dropdown quality (vì chart bị render lại)
//       attachQualityDropdown(window.leadAll);

//       console.log(
//         "🔄 Cleared filters → showing all leads:",
//         window.leadAll.length
//       );
//     };
//   }

//   // ============ TIME FILTER ============
//   attachTimeDropdownHandlers(onRangePicked);

//   function onRangePicked(fromYMD, toYMD, labelText) {
//     window.currentRange = { from: fromYMD, to: toYMD };
//     if (domDateEl) {
//       const f = toDMY(parseYMD(fromYMD));
//       const t = toDMY(parseYMD(toYMD));
//       domDateEl.textContent = `${f} - ${t}`;
//     }

//     // fetchLeads(fromYMD, toYMD) => Promise
//     fetchLeads(fromYMD, toYMD).then(() => {
//       const data = window.lastFetchedLeads || [];
//       setLeadAll(data);
//       attachAccountFilter(data); // <-- đảm bảo khôi phục filter
//       attachQualityDropdown(data);
//       renderLeadTagChart(data);
//       renderToplistByNeeded(data);
//       renderLeadTable(data);
//     });
//   }

//   // ============ TIME DROPDOWN ============
//   function attachTimeDropdownHandlers(onPicked) {
//     const timeSelect = document.querySelector(".dom_select.time");
//     if (!timeSelect) return;

//     const selectedLabel = timeSelect.querySelector(".dom_selected");
//     const menu = timeSelect.querySelector(".dom_select_show");
//     const customBox = timeSelect.querySelector(".custom_date");
//     const header = timeSelect.querySelector(".flex");
//     const applyBtn = timeSelect.querySelector(".apply_custom_date");

//     // 🟡 Toggle menu khi click header
//     header.onclick = (e) => {
//       e.stopPropagation();
//       document
//         .querySelectorAll(".dom_select")
//         .forEach((s) => s !== timeSelect && s.classList.remove("active"));
//       timeSelect.classList.toggle("active");
//     };

//     // 🟢 Click chọn từng mục thời gian
//     const lis = menu.querySelectorAll("li");
//     lis.forEach((li) => {
//       li.onclick = (e) => {
//         e.stopPropagation();
//         const type = li.dataset.date;

//         if (type === "custom_range") {
//           // Nếu chọn Custom Range → hiển thị khung nhập ngày
//           lis.forEach((i) => i.classList.remove("active"));
//           li.classList.add("active");
//           customBox.classList.add("show");
//           return;
//         }

//         // Cập nhật trạng thái
//         lis.forEach((i) => i.classList.remove("active"));
//         li.classList.add("active");

//         // Đổi label
//         selectedLabel.textContent =
//           li.querySelector("span:last-child")?.textContent.trim() ||
//           "This Month";

//         // Lấy range tương ứng
//         const range = getDateRange(type);
//         if (range) onPicked(range.from, range.to, selectedLabel.textContent);

//         // Đóng dropdown
//         timeSelect.classList.remove("active");
//         customBox.classList.remove("show");
//       };
//     });

//     // 🟠 Áp dụng khi chọn custom date
//     if (applyBtn) {
//       applyBtn.onclick = () => {
//         const start = document.getElementById("start").value;
//         const end = document.getElementById("end").value;
//         if (!start || !end) return;

//         // Giới hạn ngày tối thiểu
//         const minDate = new Date("2025-10-01");
//         const startDate = new Date(start);
//         const endDate = new Date(end);

//         if (startDate < minDate) {
//           alert("⚠️ Ngày bắt đầu không được trước 01/10/2025.");
//           return;
//         }

//         if (endDate <= startDate) {
//           alert("⚠️ Ngày kết thúc phải sau ngày bắt đầu.");
//           return;
//         }

//         selectedLabel.textContent = "Custom Date";
//         onPicked(start, end, "Custom Date");

//         timeSelect.classList.remove("active");
//         customBox.classList.remove("show");
//       };
//     }

//     // 🔹 Đóng khi click ngoài hoặc bấm ESC
//     document.onclick = (e) => {
//       if (!timeSelect.contains(e.target)) timeSelect.classList.remove("active");
//     };
//     document.onkeydown = (e) => {
//       if (e.key === "Escape") timeSelect.classList.remove("active");
//     };
//   }

//   function getDateRange(option) {
//     const startOfDay = (d) => {
//       d.setHours(0, 0, 0, 0);
//       return d;
//     };
//     const today = startOfDay(new Date());
//     const mondayThisWeek = (() => {
//       const k = (today.getDay() + 6) % 7;
//       const d = new Date(today);
//       d.setDate(today.getDate() - k);
//       return d;
//     })();
//     let from, to;
//     switch (option) {
//       case "this_week":
//         from = new Date(mondayThisWeek);
//         to = new Date(mondayThisWeek);
//         to.setDate(from.getDate() + 6);
//         break;
//       case "last_week":
//         from = new Date(mondayThisWeek);
//         from.setDate(from.getDate() - 7);
//         to = new Date(from);
//         to.setDate(from.getDate() + 6);
//         break;
//       case "this_month":
//         from = new Date(today.getFullYear(), today.getMonth(), 1);
//         to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
//         break;
//       case "last_month":
//         from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
//         to = new Date(today.getFullYear(), today.getMonth(), 0);
//         break;
//       case "this_year":
//         from = new Date(today.getFullYear(), 0, 1);
//         to = new Date(today.getFullYear(), 11, 31);
//         break;
//       default:
//         from = new Date(today);
//         to = new Date(today);
//     }
//     const fmt = (d) =>
//       `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
//         d.getDate()
//       ).padStart(2, "0")}`; // không dùng toISOString()

//     return { from: fmt(from), to: fmt(to) };
//   }

//   // ============ AUTO LOAD LẦN ĐẦU ============
//   const init = getDateRange("this_month");
//   onRangePicked(init.from, init.to, "This Month");
// });
