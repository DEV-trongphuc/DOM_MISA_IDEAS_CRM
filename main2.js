// ----------------------------------------
// ⚙️ Cấu hình Tag ưu tiên
// ----------------------------------------

// ----------------------------------------
// 📥 Lấy dữ liệu giả lập từ local file
// ----------------------------------------
let CRM_DATA = [];
function waitForOTP() {
  return new Promise((resolve, reject) => {
    const container = document.querySelector(".dom_accounts");
    const overlay = document.querySelector(".dom_accounts_overlay");
    const confirmBtn = document.getElementById("view_report");
    const otpInput = document.getElementById("access_token");

    if (!container || !confirmBtn || !otpInput || !overlay) {
      return reject("Không tìm thấy các thành phần UI OTP");
    }

    // Hiện UI
    container.classList.add("active");
    overlay.classList.add("active");

    const handler = () => {
      const otp = otpInput.value.trim();
      if (!otp) {
        alert("Vui lòng nhập OTP!");
        return;
      }
      // Ẩn UI sau khi confirm
      container.classList.remove("active");
      overlay.classList.remove("active");
      confirmBtn.removeEventListener("click", handler);
      resolve(otp);
    };

    confirmBtn.addEventListener("click", handler);
  });
}

async function loginFlow(username, password) {
  // ==== Bước 1: Login nhận temp token ====
  const formData1 = new FormData();
  formData1.append("Username", username);
  formData1.append("Password", password);

  const res1 = await fetch("https://ideas.edu.vn/login_otp.php?step=login", {
    method: "POST",
    body: formData1,
  });
  const data1 = await res1.json();
  console.log("Step 1 response:", data1);

  if (!data1.Data?.AccessToken?.Token) {
    console.error("Không nhận được temp token!");
    return;
  }
  const tempToken = data1.Data.AccessToken.Token;
  console.log("Temp Token:", tempToken);

  // ==== Bước 2: Chờ người dùng nhập OTP qua UI ====
  const otp = await waitForOTP();

  const formData2 = new FormData();
  formData2.append("OTP", otp);
  formData2.append("Token", tempToken);

  const res2 = await fetch("https://ideas.edu.vn/login_otp.php?step=otp", {
    method: "POST",
    body: formData2,
  });
  const data2 = await res2.json();
  console.log("Step 2 response:", data2);

  if (!data2.Success) {
    console.error("Login thất bại:", data2.UserMessage || data2.SystemMessage);
    return;
  }

  const accessToken = data2.Data.AccessToken?.Token;
  console.log("Access Token chính thức:", accessToken);

  // ==== Bước 3: Lấy info user với token chính thức ====
  const res3 = await fetch("https://ideas.edu.vn/login_otp.php?step=crm", {
    method: "POST",
  });
  const data3 = await res3.json();
  console.log("Step 3 response (User Info):", data3);

  const token = data3.Data.token;
  const refresh_token = data3.Data.refresh_token;
  localStorage.setItem("misa_token", token);
  localStorage.setItem("misa_refresh_token", refresh_token);

  return { token, refresh_token };
}
async function quickLogin() {
  const response = await fetch("https://ideas.edu.vn/login_otp.php?step=crm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // Nếu cần gửi body, có thể thêm ở đây:
    // body: JSON.stringify({ username: "xxx", password: "xxx" })
  });

  const data = await response.json();
  console.log("Step 3 response (User Info):", data);

  // Lấy token và refresh_token
  const token = data?.Data?.token;
  console.log("token", token);

  if (token) {
    // ✅ Lưu vào localStorage
    localStorage.setItem("misa_token", token);
    console.log("✅ Token và Refresh Token đã được lưu vào localStorage");
  } else {
    console.warn("⚠️ Không tìm thấy token trong phản hồi:", data);
  }

  return token;
}
async function getToken(username, password) {
  // 1️⃣ Kiểm tra localStorage
  let token = localStorage.getItem("misa_token");
  if (token) return token;
  const qData = await quickLogin();
  if (qData.length) return qData;
  try {
    const lData = await loginFlow("numt@ideas.edu.vn", "Hieunu11089091");
    if (lData?.token) return lData.token;
    throw new Error("LoginFlow không trả token");
  } catch (err) {
    console.error("LoginFlow thất bại:", err);
  }

  // 4️⃣ Nếu vẫn không có token → yêu cầu nhập tay
  token = prompt("Nhập token MISA:");
  if (!token) throw new Error("Người dùng không nhập token");
  localStorage.setItem("misa_token", token);
  return token;
}
async function fetchLeads(from, to) {
  document.querySelector(".loading").classList.add("active");

  // Lấy token 1 lần
  let token = await getToken("numt@ideas.edu.vn", "Hieunu11089091");

  const url = `https://ideas.edu.vn/proxy_misa.php?from_date=${from}&to_date=${to}&token=${token}`;
  // const url = `./data.json?from_date=${from}&to_date=${to}&token=${token}`;
  const res = await fetch(url);
  const data = await res.json();

  // Nếu có dữ liệu thì gán vào CRM_DATA
  if (data.data?.length) {
    CRM_DATA = data.data;
  } else {
    console.warn("Không có dữ liệu hoặc token lỗi:", data.error);
    localStorage.removeItem("misa_token");
  }

  document.querySelector(".loading").classList.remove("active");
  return CRM_DATA;
}

// const initRange = getDateRange("this_month");

// fetchLeads(initRange.from, initRange.to, "numt@ideas.edu.vn", "Hieunu11089091");

// ----------------------------------------
// 🧠 Hàm xử lý tag
// ----------------------------------------
function getTagsArray(tagText) {
  if (!tagText) return [];
  return tagText
    .split(",")
    .map((t) => t.trim().replace(/^0\.\s*/g, "")) // bỏ tiền tố "0."
    .filter(Boolean);
}

function getPrimaryTag(tags, priorityList) {
  if (!tags || tags.length === 0) return "Untag"; // 🆕 gán Untag khi không có tag
  for (const p of priorityList) {
    if (tags.some((t) => t.includes(p))) return p;
  }
  return "Untag";
}

// ----------------------------------------
// 🧩 Xử lý dữ liệu chính
// ----------------------------------------
const tagPriority = [
  "Needed",
  "Qualified",
  "Considering",
  "Bad timing",
  "Unqualified",
  "Junk",
  "New",
  "Untag",
];

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
  RAW_DATA = await fetchLeads(initRange.from, initRange.to);
  const dateText = document.querySelector(".dom_date");
  dateText.textContent = formatDisplayDate(initRange.from, initRange.to);

  await processAndRenderAll(RAW_DATA);
  setupTimeDropdown();
  setupAccountFilter();
  setupClearFilter();
  setupQualityFilter();
  setupLeadSearch();
  setupDropdowns();
}
main();
async function processAndRenderAll(data) {
  // ⚡ 1. Xử lý dữ liệu thật nhanh
  GROUPED = processCRMData(data);
  window.grouped = GROUPED;

  // 🧩 2. Render chart trước — nhưng chia nhỏ từng nhóm để tránh lag
  queueMicrotask(() => renderChartsSmoothly(GROUPED, data));

  // 🧱 3. Render bảng & filter sau cùng (ít ảnh hưởng hiệu năng)
  requestAnimationFrame(() => {
    renderLeadTable(data);
    renderFilterOptions(data);
    renderSaleFilter(GROUPED);
  });
}

// 🧠 Hàm render chart chia nhỏ batch – không chặn main thread
function renderChartsSmoothly(GROUPED, data) {
  const chartTasks = [
    () => renderLeadTrendChart(GROUPED),
    () => renderToplist(GROUPED),
    () => renderToplistBySale(GROUPED),
    () => renderLeadQualityMeter(GROUPED),
    () => renderCampaignPieChart(GROUPED),
    () => renderTagFrequency(GROUPED),
    () => renderProgramChart(GROUPED),
    () => renderLeadTagChart(GROUPED),
    () => renderDegreeChart(data),
  ];

  let delay = 0;

  // ⚙️ render rải rác từng chart 1
  for (const task of chartTasks) {
    setTimeout(() => {
      // Chạy chart trong thời điểm idle nếu có
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => task());
      } else {
        requestAnimationFrame(() => task());
      }
    }, delay);
    delay += 50; // mỗi chart cách nhau 50ms giúp UI không lag
  }
}

function processCRMData(data) {
  const loadingEl = document.querySelector(".loading");
  if (loadingEl) loadingEl.classList.add("active");

  const r = {
    byDate: Object.create(null),
    byCampaign: Object.create(null),
    byOwner: Object.create(null),
    byTag: Object.create(null),
    byTagAndDate: Object.create(null),
    byOrg: Object.create(null),
    tagFrequency: Object.create(null),
  };

  const len = data.length;
  const tagPriorityLocal = tagPriority || [];

  // Giảm overhead của function call
  const getTagsArrayLocal = getTagsArray;
  const getPrimaryTagLocal = getPrimaryTag;

  for (let i = 0; i < len; i++) {
    const lead = data[i];

    // Cache thuộc tính, tránh truy cập object lặp lại
    const created = lead.CreatedDate;
    const date = created ? created.slice(0, 10) : "Date";
    const tags = getTagsArrayLocal(lead.TagIDText);
    let mainTag = getPrimaryTagLocal(tags, tagPriorityLocal) || "Untag";
    if (mainTag === "Qualified") mainTag = "Needed";
    if (!tags.length) tags.push("Untag");
    lead.TagMain = mainTag;

    const org = lead.CustomField16Text || "Org";
    const campaign = lead.CustomField13Text || "Campaign";
    const source = lead.CustomField14Text || "Source";
    const medium = lead.CustomField15Text || "Medium";
    const owner = lead.OwnerIDText || "No Owner";

    // === Tag Frequency ===
    for (let j = 0; j < tags.length; j++) {
      const tag = tags[j];
      r.tagFrequency[tag] = (r.tagFrequency[tag] || 0) + 1;
    }

    // === byDate ===
    const dateObj = (r.byDate[date] ||= { total: 0 });
    dateObj.total++;
    dateObj[mainTag] = (dateObj[mainTag] || 0) + 1;

    // === byTag ===
    (r.byTag[mainTag] ||= []).push(lead);

    // === byTagAndDate ===
    const tagDateObj = (r.byTagAndDate[mainTag] ||= Object.create(null));
    (tagDateObj[date] ||= []).push(lead);

    // === byCampaign (multi-level object reuse) ===
    const campObj = (r.byCampaign[campaign] ||= Object.create(null));
    const sourceObj = (campObj[source] ||= Object.create(null));
    (sourceObj[medium] ||= []).push(lead);

    // === byOwner ===
    const ownerObj = (r.byOwner[owner] ||= {
      total: 0,
      tags: Object.create(null),
      leads: [],
    });
    ownerObj.total++;
    ownerObj.leads.push(lead);
    const ownerTagObj = (ownerObj.tags[mainTag] ||= { count: 0, leads: [] });
    ownerTagObj.count++;
    ownerTagObj.leads.push(lead);

    // === byOrg ===
    const orgObj = (r.byOrg[org] ||= {
      total: 0,
      tags: Object.create(null),
      owners: Object.create(null),
      byDate: Object.create(null),
    });
    orgObj.total++;
    (orgObj.tags[mainTag] ||= []).push(lead);
    (orgObj.owners[owner] ||= []).push(lead);
    (orgObj.byDate[date] ||= []).push(lead);
  }

  setTimeout(() => {
    if (loadingEl) loadingEl.classList.remove("active");
  }, 300);
  return r;
}

document.addEventListener("DOMContentLoaded", () => {
  const menuItems = document.querySelectorAll(".dom_menu li");
  const container = document.querySelector(".dom_container");

  menuItems.forEach((li) => {
    li.addEventListener("click", () => {
      // 🟡 Bỏ active cũ
      menuItems.forEach((item) => item.classList.remove("active"));

      // 🟢 Active cái được chọn
      li.classList.add("active");

      // 🧹 Xóa tất cả class view cũ trong container
      container.classList.forEach((cls) => {
        // chỉ xóa nếu nó trùng với data-view của menu
        if (["dashboard", "sale", "da", "won"].includes(cls)) {
          container.classList.remove(cls);
        }
      });

      // 🚀 Thêm class mới tương ứng (theo data-view)
      const view = li.getAttribute("data-view");
      container.classList.add(view);
    });
  });
});

function renderSaleFilter(grouped) {
  setupSaleQualityDropdown(grouped);
  setupLeadTagChartBySale(grouped);
  renderToplistBySale(grouped);
  renderLeadSaleChart(grouped, "Needed");
}
// ============================
// RENDER FILTERS
// ============================
function renderFilterOptions(data) {
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
  const groupedAll = processCRMData(data);
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
  const qualitySelect = document.querySelector(".dom_select.quality");
  if (!qualitySelect) return;

  const toggle = qualitySelect.querySelector(".flex");
  const list = qualitySelect.querySelector("ul.dom_select_show");
  const selectedEl = qualitySelect.querySelector(".dom_selected");
  const allItems = list.querySelectorAll("li");

  // 🟡 Toggle mở/đóng dropdown (click bất kỳ trong vùng .dom_select)
  qualitySelect.onclick = (e) => {
    e.stopPropagation();
    const isActive = list.classList.contains("active");

    // Đóng các dropdown khác
    document
      .querySelectorAll(".dom_select_show")
      .forEach((ul) => ul !== list && ul.classList.remove("active"));

    // Toggle dropdown hiện tại
    list.classList.toggle("active", !isActive);
  };

  // 🟢 Chọn tag
  allItems.forEach((li) => {
    li.onclick = (e) => {
      e.stopPropagation();
      const tag = li.querySelector("span:nth-child(2)").textContent.trim();

      const isCurrentlyActive = li.classList.contains("active");

      // Nếu click lại chính item đang active → chỉ đóng dropdown
      if (isCurrentlyActive) {
        list.classList.remove("active");
        return;
      }

      // Reset UI active
      allItems.forEach((el) => el.classList.remove("active"));
      list
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));

      // Đánh dấu item được chọn
      li.classList.add("active");
      li.querySelector(".radio_box").classList.add("active");

      // Cập nhật nhãn hiển thị
      selectedEl.textContent = tag;

      // Cập nhật chart (giữ nguyên grouped data hiện tại)
      renderLeadTrendChart(GROUPED, tag);

      // Đóng dropdown sau khi chọn
      list.classList.remove("active");
    };
  });

  // 🔹 Click ra ngoài thì đóng dropdown
  document.addEventListener("click", (e) => {
    if (!qualitySelect.contains(e.target)) list.classList.remove("active");
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

  processAndRenderAll(filtered);
  // 3️⃣ Render lại các bộ lọc (con)

  // 4️⃣ Log kết quả / render bảng nếu cần
  console.log("✅ Filtered & regrouped data:", GROUPED);
}

// ============================
// FILTER DATA LOGIC
// ============================
function setupLeadSearch() {
  const input = document.querySelector(".dom_search");
  const btn = document.getElementById("find_data");

  if (!input || !btn) return;

  btn.onclick = () => applyLeadSearch();
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") applyLeadSearch();
  });

  function applyLeadSearch() {
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) {
      // ❌ Nếu trống → render lại toàn bộ
      renderLeadTable(RAW_DATA);
      return;
    }

    // ✅ Lọc theo số điện thoại hoặc tên sale
    const filtered = RAW_DATA.filter((lead) => {
      const phone = lead.Mobile?.toLowerCase() || "";
      const owner = lead.OwnerIDText?.toLowerCase() || "";
      return phone.includes(keyword) || owner.includes(keyword);
    });

    // 🧮 Render lại bảng với dữ liệu lọc
    renderLeadTable(filtered);

    // Nếu không có kết quả thì báo
    if (filtered.length === 0) {
      const container = document.querySelector(".dom_table_box");
      if (container)
        container.innerHTML = `
            <div class="dom_table_container empty">
              <p>Không tìm thấy dữ liệu phù hợp cho "<b>${keyword}</b>"</p>
            </div>
          `;
    }
  }
}

function setupLeadTagChartBySale(grouped) {
  const selectWrap = document.querySelector(".dom_select.sale_tag_chart");
  if (!selectWrap) return;

  const dropdown = selectWrap.querySelector(".dom_select_show");
  const selected = selectWrap.querySelector(".dom_selected");
  const searchInput = document.querySelector(".dom_search");
  if (!grouped?.byOwner) return;

  // 🧮 Danh sách sale (ẩn mã NV)
  const sales = Object.keys(grouped.byOwner).map((n) =>
    n.replace(/\s*\(NV.*?\)/gi, "").trim()
  );
  const defaultSale = sales[0];

  // 🧹 Render danh sách sale
  dropdown.innerHTML = sales
    .map(
      (s) => `
      <li class="${s === defaultSale ? "active" : ""}">
        <span class="radio_box ${s === defaultSale ? "active" : ""}"></span>
        <span>${s}</span>
      </li>
    `
    )
    .join("");

  // ✅ Hiển thị mặc định
  selected.textContent = defaultSale;
  renderLeadTagChartBySale(grouped, defaultSale);

  // 🟡 Toggle dropdown
  const toggle = selectWrap.querySelector(".flex");
  if (!toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".dom_select_show.active").forEach((u) => {
        if (u !== dropdown) u.classList.remove("active");
      });
      dropdown.classList.toggle("active");
    });
  }

  // ✅ Dùng event delegation (1 listener duy nhất)
  if (!dropdown.dataset.bound) {
    dropdown.dataset.bound = "1";
    dropdown.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (!li) return;

      // Bỏ active cũ
      dropdown
        .querySelectorAll("li")
        .forEach((el) => el.classList.remove("active"));
      dropdown
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));

      // Active mới
      li.classList.add("active");
      li.querySelector(".radio_box").classList.add("active");

      const saleName = li.querySelector("span:nth-child(2)").textContent.trim();
      selected.textContent = saleName;

      // Cập nhật biểu đồ + bảng
      renderLeadTagChartBySale(grouped, saleName);

      if (searchInput) searchInput.value = saleName;
      const filtered = RAW_DATA.filter((lead) => {
        const owner = lead.OwnerIDText?.toLowerCase() || "";
        return owner.includes(saleName.toLowerCase());
      });
      renderLeadTable(filtered);

      dropdown.classList.remove("active");
    });
  }

  // 🔹 Click ngoài để đóng (gán 1 lần duy nhất)
  if (!document._saleTagOutside) {
    document.addEventListener("click", (e) => {
      if (!selectWrap.contains(e.target)) dropdown.classList.remove("active");
    });
    document._saleTagOutside = true;
  }
}

function renderLeadTagChartBySale(grouped, saleName) {
  const ctx = document.getElementById("leadTagChartbySale");
  if (!ctx) return;

  // 🔍 Tìm sale tương ứng nhanh hơn (dùng cache tên đã cắt)
  const matchedKey = Object.keys(grouped.byOwner).find(
    (k) => k.replace(/\s*\(NV.*?\)/gi, "").trim() === saleName
  );
  const ownerData = grouped.byOwner[matchedKey];
  if (!ownerData) return;

  // 🧭 Thứ tự cố định
  const tagOrder = [
    "Considering",
    "Needed",
    "Bad timing",
    "Unqualified",
    "Junk",
    "New",
    "Untag",
  ];

  // 🧮 Chuẩn bị dữ liệu gọn, không map/filter lồng nhau
  const labels = [];
  const values = [];
  for (let i = 0; i < tagOrder.length; i++) {
    const tag = tagOrder[i];
    const count = ownerData.tags?.[tag]?.count || 0;
    if (count > 0) {
      labels.push(tag);
      values.push(count);
    }
  }

  const maxValue = Math.max(...values);
  const barColors = values.map((v) => (v === maxValue ? "#ffa900" : "#d9d9d9"));

  // 🔧 Nếu chart đã có → chỉ update khi data khác
  if (window.leadTagChartBySaleInstance) {
    const chart = window.leadTagChartBySaleInstance;
    const ds = chart.data.datasets[0];

    // So sánh nhanh → nếu không đổi thì khỏi update
    if (
      arraysEqual(chart.data.labels, labels) &&
      arraysEqual(ds.data, values)
    ) {
      return;
    }

    chart.data.labels = labels;
    ds.data = values;
    ds.backgroundColor = barColors;
    ds.borderColor = barColors;
    ds.label = `Leads by Tag (${saleName})`;
    chart.update("active"); // ⚡ update không animation
    return;
  }

  // 🚀 Tạo chart lần đầu (animation cực nhẹ)
  window.leadTagChartBySaleInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: `Leads by Tag (${saleName})`,
          data: values,
          backgroundColor: barColors,
          borderColor: barColors,
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 1,
          categoryPercentage: 0.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300, easing: "easeOutQuad" }, // ⚙️ mượt nhẹ mà vẫn nhanh
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
          font: { weight: "bold", size: 12 },
          color: "#333",
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: "rgb(240, 240, 240)",
            drawTicks: false,
            drawBorder: false,
          },
          ticks: { font: { size: 12 }, color: "rgb(85, 85, 85)" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: "rgb(102, 102, 102)",
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
          grid: { color: "rgb(240, 240, 240)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });

  // ⚙️ So sánh mảng nhanh
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}

function filterLeadsBySelection(data) {
  return data.filter((lead) => {
    const campaign = lead.CustomField13Text || "Campaign";
    const source = lead.CustomField14Text || "Source";
    const medium = lead.CustomField15Text || "Medium";

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
    // 🔄 Reset biến filter
    currentFilter.campaign = null;
    currentFilter.source = null;
    currentFilter.medium = null;

    // 🧹 Chỉ reset các dropdown trong .dom_filter (campaign/source/medium)
    const filterArea = document.querySelector(".dom_filter");
    if (filterArea) {
      ["campaign", "source", "medium"].forEach((cls) => {
        const select = filterArea.querySelector(`.dom_select.${cls}`);
        if (!select) return;

        const selected = select.querySelector(".dom_selected");
        if (selected) {
          if (cls === "campaign") selected.textContent = "All campaign";
          if (cls === "source") selected.textContent = "All Source";
          if (cls === "medium") selected.textContent = "All Medium";
        }

        // Gỡ class active
        select
          .querySelectorAll("li.active")
          .forEach((li) => li.classList.remove("active"));
        select
          .querySelectorAll(".radio_box.active")
          .forEach((r) => r.classList.remove("active"));
      });
    }

    // ✅ Giữ nguyên account hiện tại
    const currentAccount =
      localStorage.getItem("selectedAccount") || "Total Data";
    let filteredData = RAW_DATA;

    if (currentAccount === "VTCI") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() == "VTCI"
      );
    } else if (currentAccount === "IDEAS") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() == "IDEAS"
      );
    }
    console.log(currentAccount);

    // ✅ Process lại
    setActiveAccountUI(currentAccount);
    processAndRenderAll(filteredData);

    // ✅ Re-render toàn bộ dashboard (theo account hiện tại)
    // renderFilterOptions();
    // renderLeadTrendChart(GROUPED, currentTagFilter);
    // updateLeadCounters(GROUPED, currentTagFilter);
    // renderToplist(GROUPED);
    // renderCampaignPieChart(GROUPED);
    // renderTagFrequency(GROUPED);
    // renderLeadQualityMeter(GROUPED);
    // renderLeadTable(filteredData);
    // renderSaleFilter(GROUPED);
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

// Hàm cập nhật UI account khi reset về Total Data
function setActiveAccountUI(accountName) {
  const activeBlock = document.querySelector(
    ".dom_account_view_block .account_item"
  );
  if (!activeBlock) return;

  const accountMap = {
    VTCI: {
      img: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
    },
    IDEAS: {
      img: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
    },
    "Total Data": {
      img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRlIpztniIEN5ZYvLlwwqBvhzdodvu2NfPSbg&s",
    },
  };

  const acc = accountMap[accountName] || accountMap["Total Data"];
  const avatar = activeBlock.querySelector(".account_item_avatar");
  const name = activeBlock.querySelector(".account_item_name");

  avatar.src = acc.img;
  name.textContent = accountName;

  // Ẩn account đang chọn khỏi danh sách
  document.querySelectorAll(".dom_account_view ul li").forEach((li) => {
    const liName = li.querySelector("p span:first-child")?.textContent.trim();
    if (liName === accountName) {
      li.style.display = "none";
    } else {
      li.style.display = "";
    }
  });
}

function clearAllDropdownFilters() {
  console.log("🧹 Reset filter dropdown (campaign/source/medium)");

  currentFilter.campaign = null;
  currentFilter.source = null;
  currentFilter.medium = null;

  const filterArea = document.querySelector(".dom_filter");
  if (!filterArea) return;

  ["campaign", "source", "medium"].forEach((cls) => {
    const select = filterArea.querySelector(`.dom_select.${cls}`);
    if (!select) return;

    const selected = select.querySelector(".dom_selected");
    if (selected) {
      if (cls === "campaign") selected.textContent = "All campaign";
      if (cls === "source") selected.textContent = "All Source";
      if (cls === "medium") selected.textContent = "All Medium";
    }

    select
      .querySelectorAll("li.active, .radio_box.active")
      .forEach((el) => el.classList.remove("active"));
  });
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

      // Lưu & set UI
      localStorage.setItem("selectedAccount", account);
      setActiveAccountUI(account);
      list.classList.remove("active");

      // ✅ Clear toàn bộ campaign/source/medium filter
      clearAllDropdownFilters();

      // 🔹 Lọc dữ liệu theo account
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

      // 🔹 Process lại và render lại toàn bộ dashboard
      processAndRenderAll(filtered);
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
      // ✅ Reset account về “Total Data”
      localStorage.setItem("selectedAccount", "Total Data");
      setActiveAccountUI("Total Data");
      processAndRenderAll(RAW_DATA);
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
    processAndRenderAll(RAW_DATA);
    // ✅ Reset account về “Total Data”
    localStorage.setItem("selectedAccount", "Total Data");
    setActiveAccountUI("Total Data");
    list.classList.remove("active");
    customBox.classList.remove("show");
  };

  // 🔹 Đóng khi click ra ngoài
  document.addEventListener("click", (e) => {
    if (!timeSelect.contains(e.target)) list.classList.remove("active");
  });
}
function setupDropdowns() {
  // ✅ các selector tái sử dụng
  const showSelectors =
    ".dom_select.saleperson_detail .dom_select_show, .dom_select.campaign .dom_select_show, .dom_select.source .dom_select_show, .dom_select.medium .dom_select_show";
  const containerSelectors =
    ".dom_select.saleperson_detail, .dom_select.campaign, .dom_select.source, .dom_select.medium";
  const activeGroupSelectors =
    ".dom_select.saleperson_detail .dom_select_show.active, .dom_select.campaign .dom_select_show.active, .dom_select.source .dom_select_show.active, .dom_select.medium .dom_select_show.active";
  const itemSelectors =
    ".dom_select.saleperson_detail .dom_select_show li, .dom_select.campaign .dom_select_show li, .dom_select.source .dom_select_show li, .dom_select.medium .dom_select_show li";

  // 🔹 Đóng tất cả dropdown show trong nhóm
  document
    .querySelectorAll(showSelectors)
    .forEach((u) => u.classList.remove("active"));

  // 🔹 Chỉ chọn đúng các dropdown container cần setup
  const selects = document.querySelectorAll(containerSelectors);

  // flag tạm khi vừa chọn item
  let justSelected = false;

  selects.forEach((sel) => {
    const toggle = sel.querySelector(".flex");
    const list = sel.querySelector(".dom_select_show");
    if (!toggle || !list) return;

    // ⛔ Chặn gán trùng listener trên toggle
    if (toggle.dataset.dropdownBound) return;
    toggle.dataset.dropdownBound = "1";

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();

      // Nếu vừa chọn item thì bỏ qua (tránh bật lại)
      if (justSelected) return;

      // 🔹 Đóng dropdown khác trong nhóm
      document.querySelectorAll(activeGroupSelectors).forEach((u) => {
        if (u !== list) u.classList.remove("active");
      });

      // 🔹 Mở/tắt dropdown hiện tại
      list.classList.toggle("active");
    });
  });

  // 🔹 Global click (chỉ bind 1 lần)
  if (!window.__dropdownGlobalBound) {
    window.__dropdownGlobalBound = true;

    document.addEventListener("click", (e) => {
      // Nếu vừa chọn item thì bỏ qua (tránh bật lại)
      if (justSelected) return;

      const clickedItem = e.target.closest(itemSelectors);

      if (clickedItem) {
        // Mark và reset sau 200ms để tránh race với toggle
        justSelected = true;
        setTimeout(() => (justSelected = false), 200);

        // Đóng tất cả dropdown active trong nhóm
        document
          .querySelectorAll(activeGroupSelectors)
          .forEach((u) => u.classList.remove("active"));
        return;
      }

      // Nếu click ngoài nhóm dropdown -> đóng hết trong nhóm
      if (!e.target.closest(containerSelectors)) {
        document
          .querySelectorAll(activeGroupSelectors)
          .forEach((u) => u.classList.remove("active"));
      }
    });
  }
}

function renderLeadTagChart(grouped) {
  const ctx = document.getElementById("leadTagChart");
  const top_tag = document.getElementById("top_tag");
  if (!ctx || !grouped?.byTag) return;

  // ⚙️ Gom dữ liệu siêu nhanh (cache & tránh tính thừa)
  const entries = Object.entries(grouped.byTag);
  if (!entries.length) return;

  const labels = [];
  const values = [];
  let maxIndex = 0;
  let maxValue = 0;

  for (let i = 0; i < entries.length; i++) {
    const [tag, arr] = entries[i];
    const count = arr.length;
    labels.push(tag);
    values.push(count);
    if (count > maxValue) {
      maxValue = count;
      maxIndex = i;
    }
  }

  // 🎨 Tô màu: cột lớn nhất vàng
  const barColors = new Array(values.length).fill("#d9d9d9");
  barColors[maxIndex] = "#ffa900";

  // 🏷️ Gán top tag nhanh
  if (top_tag) top_tag.textContent = labels[maxIndex] || "";

  // ⚡ Nếu chart đã tồn tại → chỉ update khi data khác
  const chart = window.leadTagChartInstance;
  if (chart) {
    const oldData = chart.data.datasets[0].data;
    // tránh re-render vô ích
    if (
      oldData.length === values.length &&
      oldData.every((v, i) => v === values[i])
    )
      return;

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = barColors;
    chart.data.datasets[0].borderColor = barColors;
    chart.update();
    return;
  }

  // 🚀 Tạo chart mới
  window.leadTagChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Leads by Tag",
          data: values,
          backgroundColor: barColors,
          borderColor: barColors,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,

      // ⚡ Animation cực nhanh
      animation: {
        duration: 400,
        easing: "easeOutCubic",
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
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false,
          },
          ticks: { font: { size: 12 }, color: "#555" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            color: "#666",
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.05),
          grid: { color: "rgba(0,0,0,0.04)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

// ======================
// 🧩 Render Toplist
// ======================
function renderToplist(grouped, mode = "default") {
  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist");
  if (!wrap || !grouped?.byCampaign) return;

  const list = [];

  // 🧮 Duyệt dữ liệu
  for (const [campaign, sources] of Object.entries(grouped.byCampaign)) {
    let totalCampaign = 0;
    let qualityCampaign = 0;

    for (const [source, mediums] of Object.entries(sources)) {
      for (const [medium, leads] of Object.entries(mediums)) {
        const total = leads.length;
        const needed = leads.filter((l) => l.TagMain === "Needed").length;
        const considering = leads.filter(
          (l) => l.TagMain === "Considering"
        ).length;
        const quality = needed + considering;
        const ratio = total > 0 ? (quality / total) * 100 : 0;

        totalCampaign += total;
        qualityCampaign += quality;

        if (mode === "default") {
          list.push({
            key: `${campaign} - ${source} - ${medium}`,
            total,
            quality,
            ratio: +ratio.toFixed(1),
          });
        }
      }
    }

    if (mode === "campaign") {
      const ratio =
        totalCampaign > 0 ? (qualityCampaign / totalCampaign) * 100 : 0;
      list.push({
        key: `${campaign}`,
        total: totalCampaign,
        quality: qualityCampaign,
        ratio: +ratio.toFixed(1),
      });
    }
  }

  // 🔽 Sắp xếp theo tổng lead giảm dần
  list.sort((a, b) => b.total - a.total);

  // 🧹 Xóa nội dung cũ
  wrap.innerHTML = "";

  // 🎨 Logo map
  const logos = [
    {
      match: /facebook|fb/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Logo_de_Facebook.png/1200px-Logo_de_Facebook.png",
    },
    {
      match: /google/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/1200px-Google_%22G%22_logo.svg.png",
    },
    {
      match: /tiktok/i,
      url: "https://www.logo.wine/a/logo/TikTok/TikTok-Icon-White-Dark-Background-Logo.wine.svg",
    },
    {
      match: /linkedin/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/1024px-LinkedIn_icon.svg.png",
    },
    {
      match: /zalo/i,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Zalo_logo_2021.svg/512px-Zalo_logo_2021.svg.png",
    },
    {
      match: /Other - Web VTCI/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/520821295_122209126670091888_6779497482843304564_n.webp",
    },
    {
      match: /Other - Web IDEAS/i,
      url: "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp",
    },
  ];

  const defaultLogo =
    "https://ideas.edu.vn/wp-content/uploads/2025/10/518336360_122227900856081421_6060559121060410681_n.webp";

  // 🚀 Render danh sách
  for (const item of list) {
    // 🎨 Chọn màu theo ratio
    let barColor = "rgb(0, 177, 72)";
    if (item.ratio < 20) barColor = "rgb(225, 112, 85)";
    else if (item.ratio < 40) barColor = "rgb(255, 169, 0)";

    // 🧩 Chọn logo phù hợp
    let logo = defaultLogo;
    for (const entry of logos) {
      if (entry.match.test(item.key)) {
        logo = entry.url;
        break;
      }
    }

    const html = `
      <li>
        <p>
          <img src="${logo}" />
          <span>${item.key}</span>
        </p>
        <p>
          <i class="fa-solid fa-user"></i>
          <span class="total_lead">${item.total}</span>
        </p>
        <p>
          <i class="fa-solid fa-user-graduate"></i>
          <span class="quality_lead">${item.quality}</span>
        </p>
        <p class="toplist_percent" 
           style="color:${barColor}; background:rgba(${barColor
      .replace("rgb(", "")
      .replace(")", "")},0.1)">
           ${item.ratio}%
        </p>
        <p class="toplist_more">
          <i class="fa-solid fa-ellipsis"></i>
        </p>
      </li>
    `;

    wrap.insertAdjacentHTML("beforeend", html);
  }
}

// ======================
// ⚙️ Nút toggle chế độ lọc
// ======================
document.addEventListener("DOMContentLoaded", () => {
  const btnSource = document.querySelector(".button_group .btn-source");
  const btnCampaign = document.querySelector(".button_group .btn-campaign");

  if (!btnSource || !btnCampaign) return;

  btnSource.addEventListener("click", () => {
    btnSource.classList.add("active");
    btnCampaign.classList.remove("active");
    renderToplist(GROUPED, "default");
  });

  btnCampaign.addEventListener("click", () => {
    btnCampaign.classList.add("active");
    btnSource.classList.remove("active");
    renderToplist(GROUPED, "campaign");
  });
});

function setupSaleQualityDropdown(grouped) {
  const select = document.querySelector(".dom_select.sale_quality");
  if (!select) return;

  const selectedLabel = select.querySelector(".dom_selected");
  const list = select.querySelector(".dom_select_show");
  const toggle = select.querySelector(".flex");

  // ⚙️ Gán toggle 1 lần duy nhất
  if (!toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".dom_select_show.active").forEach((u) => {
        if (u !== list) u.classList.remove("active");
      });
      list.classList.toggle("active");
    });
  }

  // 🧹 Clear listener cũ
  list.querySelectorAll("li").forEach((li) => {
    const newLi = li.cloneNode(true);
    li.parentNode.replaceChild(newLi, li);
  });

  // 🟢 Gán click chọn
  list.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      const tag = li.querySelector("span:nth-child(2)").textContent.trim();

      // Active UI
      list.querySelectorAll("li").forEach((i) => i.classList.remove("active"));
      li.classList.add("active");

      list
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));
      li.querySelector(".radio_box").classList.add("active");

      // Cập nhật label
      selectedLabel.textContent = tag;

      // Cập nhật chart
      renderLeadSaleChart(grouped, tag);

      // Đóng dropdown
      list.classList.remove("active");
    });
  });

  // 🔹 Đóng khi click ngoài (gán 1 lần duy nhất)
  if (!document._saleQualityOutside) {
    document.addEventListener("click", (e) => {
      if (!select.contains(e.target)) list.classList.remove("active");
    });
    document._saleQualityOutside = true;
  }
}

function renderCampaignPieChart(grouped) {
  const ctx = document.getElementById("pieCampaign");
  if (!ctx) return;

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
    "#ffa900", // vàng
    "#262a53", // xanh than
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
          position: "bottom", // ✅ canh bên phải
          align: "center",
          labels: {
            boxWidth: 8,
            padding: 10,
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
function renderLeadSaleChart(grouped, tagFilter = "Needed") {
  if (!grouped?.byOwner) return;

  const ctx = document.getElementById("leadSale");
  if (!ctx) return;

  // 🧮 Chuẩn bị dữ liệu (dùng mảng tĩnh, tránh push nhiều lần)
  const entries = Object.entries(grouped.byOwner);
  const labels = new Array(entries.length);
  const totalCounts = new Array(entries.length);
  const tagCounts = new Array(entries.length);

  for (let i = 0; i < entries.length; i++) {
    const [owner, ownerData] = entries[i];
    labels[i] = owner.replace(/\s*\(NV.*?\)/gi, "").trim();
    totalCounts[i] = ownerData.total || 0;
    tagCounts[i] = ownerData.tags?.[tagFilter]?.count || 0;
  }

  const maxValue = Math.max(...totalCounts, ...tagCounts);
  const ctx2d = ctx.getContext("2d");

  const tagColor = "rgba(38, 42, 83, 0.8)";
  const totalColor = "rgba(255, 171, 0, 0.8)";

  // 🔁 Nếu chart đã có → update nhanh, không re-render toàn bộ
  if (window.leadSaleChartInstance) {
    const chart = window.leadSaleChartInstance;
    const ds0 = chart.data.datasets[0];
    const ds1 = chart.data.datasets[1];

    // ✅ Chỉ cập nhật nếu dữ liệu thay đổi (tránh trigger animation vô ích)
    let changed = false;
    if (
      chart.data.labels.length !== labels.length ||
      chart.data.labels.some((l, i) => l !== labels[i])
    ) {
      chart.data.labels = labels;
      changed = true;
    }
    if (!arraysEqual(ds0.data, totalCounts)) {
      ds0.data = totalCounts;
      changed = true;
    }
    if (!arraysEqual(ds1.data, tagCounts)) {
      ds1.data = tagCounts;
      ds1.label = `${tagFilter} Leads`;
      changed = true;
    }

    if (changed) {
      // 🚀 Tắt animation khi update để tăng tốc
      chart.update("active");
    }
    return;
  }

  // 🚀 Tạo chart lần đầu
  window.leadSaleChartInstance = new Chart(ctx2d, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Total Leads",
          data: totalCounts,
          backgroundColor: totalColor,
          borderColor: totalColor.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: 5,
        },
        {
          label: `${tagFilter} Leads`,
          data: tagCounts,
          backgroundColor: tagColor,
          borderColor: tagColor.replace("0.8", "1"),
          borderWidth: 1,
          borderRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // ⚙️ tắt animation khởi tạo → load cực nhanh
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "end" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = totalCounts[ctx.dataIndex] || 0;
              const count = ctx.parsed.y || 0;
              const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
              return `${
                ctx.dataset.label
              }: ${count.toLocaleString()} leads (${pct}%)`;
            },
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#444",
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#666",
            stepSize: Math.ceil(maxValue / 4) || 1,
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
        },
      },
    },
    plugins: [ChartDataLabels],
  });

  // 🔧 Hàm so sánh mảng nhanh
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}

function maskEmail(email) {
  if (!email) return "-";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 3);
  return `${visible}...@${domain}`;
}

function maskMobile(mobile) {
  if (!mobile) return "-";
  const last4 = mobile.slice(-4);
  return "*".repeat(Math.max(0, mobile.length - 4)) + last4;
}

// function renderLeadTable(leads) {
//   const container = document.querySelector(".dom_table_box");
//   if (!container) return;

//   if (!Array.isArray(leads) || leads.length === 0) {
//     container.innerHTML = `
//         <div class="dom_table_container empty">
//           <p>Không có dữ liệu để hiển thị</p>
//         </div>`;
//     return;
//   }

//   const headers = [
//     "Created Date",
//     "Lead Name",
//     "Email",
//     "Mobile",
//     "Owner",
//     "Tags",
//     "Campaign",
//     "Source",
//     "Medium",
//     "Organization",
//     "Description",
//   ];

//   const rowsHtml = leads
//     .map((lead, i) => {
//       const {
//         CreatedDate,
//         LeadName,
//         Email,
//         Mobile,
//         OwnerIDText,
//         TagIDText,
//         CustomField13Text,
//         CustomField14Text,
//         CustomField15Text,
//         CustomField16Text,
//         Description,
//       } = lead;

//       const date = CreatedDate
//         ? new Date(CreatedDate).toLocaleDateString("vi-VN")
//         : "-";

//       // 🏷️ Tags
//       let tagHtml = "-";
//       if (TagIDText && TagIDText.trim() !== "") {
//         const tags = TagIDText.split(",")
//           .map((t) => t.trim())
//           .filter(Boolean);
//         tagHtml = tags
//           .map((tag) => {
//             let tagClass = "";
//             if (tag.includes("Needed")) tagClass = "tag_needed";
//             else if (tag.includes("Considering")) tagClass = "tag_considering";
//             else if (tag.includes("Bad timing")) tagClass = "tag_bad";
//             else if (tag.includes("Unqualified")) tagClass = "tag_unqualified";
//             else if (tag.includes("Junk")) tagClass = "tag_junk";
//             else tagClass = "tag_other";
//             return `<span class="tag_chip ${tagClass}">${tag}</span>`;
//           })
//           .join(" ");
//       }

//       return `
//           <tr data-id="${i}">
//             <td>${date}</td>
//             <td>${LeadName || "-"}</td>
//             <td>${maskEmail(Email)}</td>
//             <td><i class="fa-solid fa-phone table_phone"></i> ${maskMobile(
//               Mobile
//             )}</td>
//             <td>${OwnerIDText.replace(/\s*\(NV.*?\)/gi, "").trim() || "-"}</td>
//             <td>${tagHtml}</td>
//             <td>${CustomField13Text || "-"}</td>
//             <td>${CustomField14Text || "-"}</td>
//             <td>${CustomField15Text || "-"}</td>
//             <td>${CustomField16Text || "-"}</td>
//             <td>${Description || "-"}</td>
//           </tr>
//         `;
//     })
//     .join("");

//   const footer = `
//       <tfoot>
//         <tr>
//           <td colspan="3">
//             <strong>Total: ${leads.length.toLocaleString("en-US")} lead${
//     leads.length > 1 ? "s" : ""
//   }</strong>
//           </td>
//           <td colspan="${headers.length - 3}"></td>
//         </tr>
//       </tfoot>
//     `;

//   container.innerHTML = `
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
// }
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

  // 🧱 Khởi tạo bảng cơ bản trước (để user thấy khung nhanh)
  container.innerHTML = `
    <div class="dom_table_container">
      <table id="main_table">
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody></tbody>
        <tfoot>
          <tr><td colspan="${
            headers.length
          }">Đang tải ${leads.length.toLocaleString()} leads...</td></tr>
        </tfoot>
      </table>
    </div>`;

  const tbody = container.querySelector("tbody");
  const tfoot = container.querySelector("tfoot");
  let index = 0;
  const chunk = 300; // render 300 dòng/lần

  function renderChunk() {
    const end = Math.min(index + chunk, leads.length);
    let html = "";

    for (let i = index; i < end; i++) {
      const l = leads[i];
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
      } = l;

      const date = CreatedDate
        ? new Date(CreatedDate).toLocaleDateString("vi-VN")
        : "-";

      // 🏷️ Tags giữ nguyên màu + class UI
      let tagHtml = "-";
      if (TagIDText?.trim()) {
        const tags = TagIDText.split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        tagHtml = tags
          .map((tag) => {
            const tagClass = /Needed/i.test(tag)
              ? "tag_needed"
              : /Considering/i.test(tag)
              ? "tag_considering"
              : /Bad timing/i.test(tag)
              ? "tag_bad"
              : /Unqualified/i.test(tag)
              ? "tag_unqualified"
              : /Junk/i.test(tag)
              ? "tag_junk"
              : "tag_other";
            return `<span class="tag_chip ${tagClass}">${tag}</span>`;
          })
          .join(" ");
      }

      html += `
        <tr data-id="${i}">
          <td>${date}</td>
          <td>${LeadName || "-"}</td>
          <td>${maskEmail(Email)}</td>
          <td><i class="fa-solid fa-phone table_phone"></i> ${maskMobile(
            Mobile
          )}</td>
          <td>${OwnerIDText?.replace(/\s*\(NV.*?\)/gi, "").trim() || "-"}</td>
          <td>${tagHtml}</td>
          <td>${CustomField13Text || "-"}</td>
          <td>${CustomField14Text || "-"}</td>
          <td>${CustomField15Text || "-"}</td>
          <td>${CustomField16Text || "-"}</td>
          <td>${Description || "-"}</td>
        </tr>`;
    }

    // ⚙️ Append 1 lần (tối ưu DOM)
    tbody.insertAdjacentHTML("beforeend", html);
    index = end;

    if (index < leads.length) {
      // tiếp tục render phần còn lại khi browser rảnh
      requestIdleCallback(renderChunk);
    } else {
      // ✅ Cập nhật footer cuối cùng
      tfoot.innerHTML = `
        <tr>
          <td colspan="3">
            <strong>Total: ${leads.length.toLocaleString("en-US")} lead${
        leads.length > 1 ? "s" : ""
      }</strong>
          </td>
          <td colspan="${headers.length - 3}"></td>
        </tr>`;
    }
  }

  // bắt đầu render
  renderChunk();
}

// ======================  CHART ======================

function renderTagFrequency(grouped) {
  const wrap = document.querySelector(".frequency_tag");
  if (!wrap || !grouped?.tagFrequency) return;

  const raw = grouped.tagFrequency;
  const exclude = new Set([
    "Needed",
    "Considering",
    "Bad timing",
    "Status - Bad timing",
    "Status - Junk",
    "Qualified",
    "Msc_AI UMEF",
    "MBA UMEF",
    "EMBA UMEF",
    "Unqualified",
    "Status - New",
    "Junk",
    "BBA",
  ]);

  // ✅ Tạo list và sort nhanh (chỉ 1 lần)
  const list = Object.entries(raw)
    .filter(([tag]) => !exclude.has(tag))
    .sort((a, b) => b[1] - a[1]);

  // ✅ Clear nhanh gọn (tránh .innerHTML="" nhiều lần)
  wrap.textContent = "";

  // ⛔ Không có tag phụ
  if (!list.length) {
    wrap.innerHTML = `<p class="no_tag">Không có tag phụ nào</p>`;
    return;
  }

  // 🎨 Màu cố định, tái sử dụng, không re-alloc mỗi vòng
  const colors = [
    "#ffa900",
    "#262a53",
    "#cccccc",
    "#e17055",
    "#74b9ff",
    "#a29bfe",
    "#55efc4",
    "#fab1a0",
    "#fdcb6e",
  ];
  const colorCount = colors.length;

  // 🚀 Dựng HTML một lần → tránh append từng dòng gây reflow
  const html = list
    .map(
      ([tag, count], i) => `
        <p class="freq_tag_item" style="--tag-color:${colors[i % colorCount]}">
          <span class="tag_dot" style="background:${
            colors[i % colorCount]
          }"></span>
          <span class="tag_name">${tag}</span>
          <span class="tag_count">${count}</span>
        </p>`
    )
    .join("");

  // ✅ Cập nhật DOM 1 lần duy nhất
  wrap.insertAdjacentHTML("beforeend", html);
}

function renderDegreeChart(grouped) {
  const ctx = document.getElementById("degreeChart");
  const top_edu = document.getElementById("top_edu");
  if (!ctx || !Array.isArray(grouped)) return;

  // 🧩 Regex pre-compile — giảm CPU
  const regex = {
    duoiCD: /(dưới[\s_]*cao[\s_]*đẳng|duoi[\s_]*cao[\s_]*dang)/i,
    caoDang: /(cao[\s_]*đẳng|cao[\s_]*dang)/i,
    thpt: /\bthpt\b|trung[\s_]*học[\s_]*phổ[\s_]*thông/i,
    sinhVien: /(sinh[\s_]*viên|sinh[\s_]*vien|sinhvien)/i,
    cuNhan: /(cử[\s_]*nhân|cu[\s_]*nhan)/i,
  };

  const degreeCounts = {
    "Cử nhân": 0,
    "Cao đẳng": 0,
    "Dưới cao đẳng": 0,
    THPT: 0,
    "Sinh viên": 0,
    Khác: 0,
  };

  // 🔹 Chia batch để render mượt UI (chỉ cần khi grouped lớn)
  let i = 0;
  const chunk = 500; // quét 500 lead/lần cho nhanh mà vẫn mượt

  function processChunk(deadline) {
    while (i < grouped.length && deadline.timeRemaining() > 4) {
      const desc = (grouped[i].Description || "").toLowerCase();
      if (regex.duoiCD.test(desc)) degreeCounts["Dưới cao đẳng"]++;
      else if (regex.caoDang.test(desc)) degreeCounts["Cao đẳng"]++;
      else if (regex.thpt.test(desc)) degreeCounts["THPT"]++;
      else if (regex.sinhVien.test(desc)) degreeCounts["Sinh viên"]++;
      else if (regex.cuNhan.test(desc)) degreeCounts["Cử nhân"]++;
      else if (desc.trim() !== "") degreeCounts["Khác"]++;
      i++;
    }

    if (i < grouped.length) {
      requestIdleCallback(processChunk);
    } else {
      updateChart();
    }
  }

  // ⚙️ Cập nhật chart khi xử lý xong
  function updateChart() {
    const labels = Object.keys(degreeCounts);
    const values = Object.values(degreeCounts);
    const maxValue = Math.max(...values);
    const barColors = values.map((v) =>
      v === maxValue ? "#ffa900" : "#d9d9d9"
    );

    // Gán top
    if (top_edu && maxValue > 0) {
      const maxIndex = values.indexOf(maxValue);
      top_edu.textContent = labels[maxIndex] || "";
    }

    // 🔄 Nếu chart tồn tại, update nhẹ
    if (window.degreeChartInstance) {
      const chart = window.degreeChartInstance;
      // ⚡ Chỉ update nếu khác data
      if (
        JSON.stringify(chart.data.datasets[0].data) !== JSON.stringify(values)
      ) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.data.datasets[0].backgroundColor = barColors;
        chart.data.datasets[0].borderColor = barColors;
        chart.update();
      }
      return;
    }

    // 🚀 Chart mới
    window.degreeChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Số lượng học viên theo trình độ học vấn",
            data: values,
            backgroundColor: barColors,
            borderColor: barColors,
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 400, // nhanh hơn 2 lần
          easing: "easeOutCubic",
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toLocaleString()} học viên`,
            },
          },
          datalabels: {
            anchor: "end",
            align: "end",
            font: { weight: "bold", size: 12 },
            formatter: (v) => (v > 0 ? v : ""),
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(0,0,0,0.05)",
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
              stepSize: Math.ceil(maxValue / 4) || 1,
              callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
            },
            afterDataLimits: (scale) => (scale.max *= 1.1),
            grid: { color: "rgba(0,0,0,0.05)" },
          },
        },
      },
      plugins: [ChartDataLabels],
    });
  }

  // 🏁 Bắt đầu xử lý
  requestIdleCallback(processChunk);
}

function renderProgramChart(grouped) {
  const ctx = document.getElementById("programChart");
  const top_program = document.getElementById("top_program");
  if (!ctx) return;

  // ✅ Dùng biến cục bộ, tránh đọc DOM nhiều lần
  const freq = grouped.tagFrequency || {};

  // ✅ Gom dữ liệu chương trình
  const programs = [
    ["MSc AI UMEF", freq["Msc_AI UMEF"] || 0],
    ["MBA UMEF", freq["MBA UMEF"] || 0],
    ["EMBA UMEF", freq["EMBA UMEF"] || 0],
    ["BBA", freq["BBA"] || 0],
    ["DBA", freq["DBA"] || 0],
  ].filter(([_, v]) => v > 0);

  if (!programs.length) {
    if (top_program) top_program.textContent = "-";
    if (window.programChartInstance) {
      window.programChartInstance.destroy();
      window.programChartInstance = null;
    }
    return;
  }

  // ✅ Chuẩn bị labels & values
  const labels = programs.map(([k]) => k);
  const values = programs.map(([_, v]) => v);
  const maxValue = Math.max(...values);
  const colors = values.map((v) => (v === maxValue ? "#ffa900" : "#d9d9d9"));

  // ✅ Cập nhật top label
  if (top_program) top_program.textContent = labels[values.indexOf(maxValue)];

  // ⚡ Nếu đã có chart → update cực nhanh, không re-render
  const existing = window.programChartInstance;
  if (existing) {
    const ds = existing.data.datasets[0];
    existing.data.labels = labels;
    ds.data = values;
    ds.backgroundColor = colors;
    ds.borderColor = colors;
    existing.options.animation.duration = 300; // nhanh hơn
    existing.update("none"); // không animation nặng
    return;
  }

  // 🚀 Tạo chart mới (chỉ chạy 1 lần)
  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false, // tắt hoàn toàn animation khi render lần đầu
      plugins: {
        legend: { display: false },
        tooltip: {
          intersect: false,
          animation: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          color: "#333",
          font: { weight: "bold", size: 12 },
          formatter: (v) => (v > 0 ? v : ""),
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#555", font: { size: 12 } },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#666",
            font: { size: 11 },
            stepSize: Math.ceil(maxValue / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });

  window.programChartInstance = chart;
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
  if (number)
    number.innerHTML = `<span>${percent}%</span><span>(${qualityCount})</span>`;

  // --- Update labels ---
  if (labelNeeded) labelNeeded.textContent = `${neededPercent}%`;
  if (labelConsidering) labelConsidering.textContent = `${consideringPercent}%`;

  // --- Update dòng tổng số ---
  if (rangeLabel) {
    const [left, right] = rangeLabel.querySelectorAll("p");
    if (left) left.textContent = `0`; // Needed + Considering
    if (right) right.textContent = `${totalLeads}`; // Total lead
  }

  // --- Màu vòng động theo chất lượng ---
  if (donut) {
    let fillColor = "#ffa900"; // mặc định vàng
    if (percent >= 40) fillColor = "#00b148"; // xanh lá khi tốt
    else if (percent <= 20) fillColor = "#e17055"; // đỏ nếu thấp
    donut.style.setProperty("--fill", fillColor);
  }
}

function renderLeadTrendChart(grouped, tagFilter = currentTagFilter) {
  currentTagFilter = tagFilter;
  const ctx = document.getElementById("leadTrendChart");
  if (!ctx) return;

  const byDate = grouped.byDate;
  const dates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));
  if (!dates.length) return;

  // ✅ Chuẩn bị data cực nhanh (vòng for native)
  const totalCounts = new Array(dates.length);
  const tagCounts = new Array(dates.length);
  for (let i = 0; i < dates.length; i++) {
    const stat = byDate[dates[i]];
    totalCounts[i] = stat.total || 0;
    tagCounts[i] = stat[tagFilter] || 0;
  }

  // ✅ Gradient cache (tạo 1 lần duy nhất)
  let gradientTotal = window._gradTotal,
    gradientTag = window._gradTag;
  const ctx2d = ctx.getContext("2d");
  if (!gradientTotal || !gradientTag) {
    gradientTotal = ctx2d.createLinearGradient(0, 0, 0, 400);
    gradientTotal.addColorStop(0, "rgba(255, 171, 0, 0.8)");
    gradientTotal.addColorStop(1, "rgba(255, 171, 0, 0.1)");
    gradientTag = ctx2d.createLinearGradient(0, 0, 0, 400);
    gradientTag.addColorStop(0, "rgba(38,42,83, 0.8)");
    gradientTag.addColorStop(1, "rgba(38,42,83, 0.1)");
    window._gradTotal = gradientTotal;
    window._gradTag = gradientTag;
  }

  // 🧮 Update lead counter + tag chart (không block UI)
  requestIdleCallback(() => {
    updateLeadCounters(grouped, currentTagFilter);
    renderLeadTagChart(grouped);
  });

  // 🔄 Nếu chart đã có → update data cực nhanh
  const chart = window.leadChartInstance;
  if (chart) {
    chart.data.labels = dates;
    const [total, tag] = chart.data.datasets;
    total.data = totalCounts;
    tag.data = tagCounts;
    tag.label = `${tagFilter} Leads`;

    // 🧠 update nhẹ, bỏ animation cũ
    chart.options.animation.duration = 400;
    chart.update("active");
    return;
  }

  // 🚀 Tạo chart mới – config tối giản, full hiệu năng
  window.leadChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Total Leads",
          data: totalCounts,
          backgroundColor: gradientTotal,
          borderColor: "#ffab00",
          fill: true,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: `${tagFilter} Leads`,
          data: tagCounts,
          backgroundColor: gradientTag,
          borderColor: "#262a53",
          fill: true,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      elements: { line: { borderJoinStyle: "round" } },
      plugins: {
        legend: false,
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#555", maxTicksLimit: 10 },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#666",
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v),
          },
          grid: { color: "rgba(0,0,0,0.05)" },
          afterDataLimits: (scale) => (scale.max *= 1.05),
        },
      },
    },
  });
}

function getColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  const s = 65 + (hash % 10);
  const l = 55 + (hash % 10);
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ==================== Khởi tạo nút Close chỉ 1 lần ====================
function initSaleDetailClose() {
  const dashboard = document.querySelector(".dom_dashboard");
  const saleDetailUI = document.querySelector(".sale_report");
  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist.sale");
  if (!dashboard || !saleDetailUI || !wrap) return;

  const closeBtn = saleDetailUI.querySelector(".sale_report_close");
  if (!closeBtn) return;

  // 🧠 Nếu đã gắn event rồi thì thôi
  if (closeBtn.dataset.bound === "1") return;
  closeBtn.dataset.bound = "1";

  closeBtn.addEventListener("click", () => {
    dashboard.classList.remove("sale_detail");

    const currentAccount =
      localStorage.getItem("selectedAccount") || "Total Data";

    let filteredData = RAW_DATA;
    if (currentAccount === "VTCI") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() === "VTCI"
      );
    } else if (currentAccount === "IDEAS") {
      filteredData = RAW_DATA.filter(
        (l) => l.CustomField16Text?.trim().toUpperCase() === "IDEAS"
      );
    }

    processAndRenderAll(filteredData);

    wrap.querySelectorAll("li").forEach((l) => l.classList.remove("active"));
    console.log("🔄 Dashboard reset về trạng thái gốc");
  });
}

// gọi 1 lần khi load dashboard
initSaleDetailClose();

// ==================== renderToplistBySale ====================
// Giữ dữ liệu gốc tạm thời (để restore)
let ORIGINAL_DATA = null;

function renderToplistBySale(grouped) {
  renderSaleDropdown();

  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist.sale");
  const dashboard = document.querySelector(".dom_dashboard");
  const saleDetailUI = document.querySelector(".sale_report");
  const dateUI = document.querySelector(".dom_date");

  if (!wrap || !grouped?.byOwner || !dashboard || !saleDetailUI || !dateUI)
    return;

  // ✅ Nếu chưa có bản gốc → lưu lại
  if (!ORIGINAL_DATA) ORIGINAL_DATA = RAW_DATA;

  const list = Object.entries(grouped.byOwner)
    .map(([owner, data]) => {
      const total = data.total || 0;
      const needed = data.tags?.Needed?.count || 0;
      const considering = data.tags?.Considering?.count || 0;
      const quality = needed + considering;
      const ratio = total > 0 ? ((quality / total) * 100).toFixed(1) : 0;
      return { key: owner, total, quality, ratio: +ratio };
    })
    .sort((a, b) => b.total - a.total);

  wrap.innerHTML = "";

  list.forEach((item) => {
    const cleanName = item.key.replace(/\(NV.*?\)/gi, "").trim();
    let barColor = "rgb(0, 177, 72)";
    if (item.ratio < 20) barColor = "rgb(225, 112, 85)";
    else if (item.ratio < 40) barColor = "rgb(255, 169, 0)";

    const bg = getColorFromName(cleanName);
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      cleanName
    )}&background=${bg}&color=fff&bold=true`;

    const html = `
      <li data-owner="${cleanName}">
        <p><img src="${avatar}" class="avatar"/><span>${cleanName}</span></p>
        <p><i class="fa-solid fa-user"></i><span class="total_lead">${
          item.total
        }</span></p>
        <p><i class="fa-solid fa-user-graduate"></i><span class="quality_lead">${
          item.quality
        }</span></p>
        <p class="toplist_percent" style="color:${barColor}; background:rgba(${barColor
      .replace("rgb(", "")
      .replace(")", "")},0.1)">${item.ratio}%</p>
        <p class="toplist_more" title="Lọc theo ${cleanName}"><i class="fa-solid fa-magnifying-glass-chart main_clr"></i></p>
      </li>`;
    wrap.insertAdjacentHTML("beforeend", html);
  });

  // 🔹 Click lọc theo sale
  wrap.querySelectorAll(".toplist_more").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const li = e.currentTarget.closest("li");
      const saleName = li.dataset.owner;
      if (!saleName) return;

      const leads = filterBySaleExact(saleName);
      processAndRenderAll(leads);
      dashboard.classList.add("sale_detail");

      const img = saleDetailUI.querySelector("img");
      const pName = saleDetailUI.querySelector(".dom_selected");
      const calender = saleDetailUI.querySelector(".sale_report_calender");
      if (img)
        img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          saleName
        )}&background=3381c1&color=fff&bold=true`;
      if (pName) pName.innerText = saleName;
      if (calender) calender.innerText = dateUI.innerText;

      const dropdown = saleDetailUI.querySelector(".dom_select_show");
      renderSaleDropdown(dropdown);

      wrap.querySelectorAll("li").forEach((l) => l.classList.remove("active"));
      li.classList.add("active");
    });
  });

  // 🔹 Khi bấm nút “tắt filter” (ở phần sale_detail)
  const backBtn = saleDetailUI.querySelector(".back_to_all");
  if (backBtn && !backBtn.dataset.bound) {
    backBtn.dataset.bound = "1";
    backBtn.addEventListener("click", () => {
      dashboard.classList.remove("sale_detail");
      if (ORIGINAL_DATA) processAndRenderAll(ORIGINAL_DATA);
    });
  }
}

// 🔹 Filter sale chính xác tên clean
function filterBySaleExact(saleName) {
  const group = processCRMData(RAW_DATA);
  if (!group?.byOwner) return [];
  const matchedSales = Object.keys(group.byOwner).filter(
    (owner) => owner.replace(/\(NV.*?\)/gi, "").trim() === saleName
  );
  return matchedSales.flatMap((owner) => group.byOwner[owner].leads || []);
}

// 🔹 Render dropdown sale từ dữ liệu tổng
function renderSaleDropdown() {
  let filteredData = RAW_DATA;
  const currentAccount =
    localStorage.getItem("selectedAccount") || "Total Data";
  if (currentAccount === "VTCI") {
    filteredData = RAW_DATA.filter(
      (l) => l.CustomField16Text?.trim().toUpperCase() == "VTCI"
    );
  } else if (currentAccount === "IDEAS") {
    filteredData = RAW_DATA.filter(
      (l) => l.CustomField16Text?.trim().toUpperCase() == "IDEAS"
    );
  }
  const group = processCRMData(filteredData);
  const saleDetailUI = document.querySelector(".sale_report");
  const dropdown = saleDetailUI.querySelector(
    ".saleperson_detail .dom_select_show"
  );
  dropdown.innerHTML = "";

  Object.keys(group.byOwner).forEach((ownerKey) => {
    const name = ownerKey.replace(/\(NV.*?\)/gi, "").trim();
    const bgColor = getColorFromName(name);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name
    )}&background=${bgColor}&color=fff&bold=true`;

    const li = document.createElement("li");
    li.dataset.owner = name;
    li.innerHTML = `<img src="${avatarUrl}"/><span>${name}</span>`;

    // Click chọn sale từ dropdown
    li.addEventListener("click", () => {
      const leads = filterBySaleExact(name);
      processAndRenderAll(leads);
      const saleDetailUI = dropdown.closest(".sale_report");
      const img = saleDetailUI.querySelector("img");
      const pName = saleDetailUI.querySelector(".dom_selected");
      if (img) img.src = avatarUrl;
      if (pName) pName.innerText = name;
    });

    dropdown.appendChild(li);
  });
}
