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
  const refresh_token = data?.Data?.refresh_token;

  if (token && refresh_token) {
    // ✅ Lưu vào localStorage
    localStorage.setItem("misa_token", token);
    localStorage.setItem("misa_refresh_token", refresh_token);
    console.log("✅ Token và Refresh Token đã được lưu vào localStorage");
  } else {
    console.warn("⚠️ Không tìm thấy token trong phản hồi:", data);
  }

  return { token, refresh_token };
}
async function getToken(username, password) {
  // 1️⃣ Kiểm tra localStorage
  let token = localStorage.getItem("misa_token");
  if (token) return token;

  // 2️⃣ Thử quickLogin
  try {
    const qData = await quickLogin();
    if (qData?.token) return qData.token;
  } catch (err) {
    console.warn("QuickLogin không thành công:", err);
  }

  // 3️⃣ Nếu vẫn chưa có → gọi loginFlow với OTP
  try {
    const lData = await loginFlow(username, password);
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
async function fetchLeads(
  from,
  to,
  username = "numt@ideas.edu.vn",
  password = "Hieunu11089091"
) {
  document.querySelector(".loading").classList.add("active");

  // Lấy token 1 lần
  let token = await getToken(username, password);

  const url = `https://ideas.edu.vn/proxy_misa.php?from_date=${from}&to_date=${to}&token=${token}`;
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
function processCRMData(data) {
  document.querySelector(".loading").classList.add("active");

  const r = {
    byDate: {},
    byCampaign: {},
    byOwner: {},
    byTag: {},
    byTagAndDate: {},
    byOrg: {},
    tagFrequency: {},
  };

  for (const lead of data) {
    const date = lead.CreatedDate?.slice(0, 10) || "Unknown Date";
    const tags = getTagsArray(lead.TagIDText);
    let mainTag = getPrimaryTag(tags, tagPriority) || "Untag";
    if (mainTag === "Qualified") mainTag = "Needed";
    if (!tags.length) tags.push("Untag");
    lead.TagMain = mainTag;

    const org = lead.CustomField16Text || "Unknown Org";
    const campaign = lead.CustomField13Text || "Unknown Campaign";
    const source = lead.CustomField14Text || "Unknown Source";
    const medium = lead.CustomField15Text || "Unknown Medium";
    const owner = lead.OwnerIDText || "No Owner";

    // 1️⃣ tag frequency
    for (const tag of tags)
      r.tagFrequency[tag] = (r.tagFrequency[tag] || 0) + 1;

    // 2️⃣ byDate
    let dateObj = r.byDate[date];
    if (!dateObj) r.byDate[date] = dateObj = { total: 0 };
    dateObj.total++;
    dateObj[mainTag] = (dateObj[mainTag] || 0) + 1;

    // 3️⃣ byTag
    let tagArr = r.byTag[mainTag];
    if (!tagArr) r.byTag[mainTag] = tagArr = [];
    tagArr.push(lead);

    // 4️⃣ byTagAndDate
    let tagDateObj = r.byTagAndDate[mainTag];
    if (!tagDateObj) r.byTagAndDate[mainTag] = tagDateObj = {};
    let dateArr = tagDateObj[date];
    if (!dateArr) tagDateObj[date] = dateArr = [];
    dateArr.push(lead);

    // 5️⃣ byCampaign
    let campObj = r.byCampaign[campaign];
    if (!campObj) r.byCampaign[campaign] = campObj = {};
    let sourceObj = campObj[source];
    if (!sourceObj) campObj[source] = sourceObj = {};
    let mediumArr = sourceObj[medium];
    if (!mediumArr) sourceObj[medium] = mediumArr = [];
    mediumArr.push(lead);

    // 6️⃣ byOwner
    let ownerObj = r.byOwner[owner];
    if (!ownerObj)
      r.byOwner[owner] = ownerObj = { total: 0, tags: {}, leads: [] };
    ownerObj.total++;
    ownerObj.leads.push(lead);
    let ownerTagObj = ownerObj.tags[mainTag];
    if (!ownerTagObj)
      ownerObj.tags[mainTag] = ownerTagObj = { count: 0, leads: [] };
    ownerTagObj.count++;
    ownerTagObj.leads.push(lead);

    // 7️⃣ byOrg
    let orgObj = r.byOrg[org];
    if (!orgObj)
      r.byOrg[org] = orgObj = { total: 0, tags: {}, owners: {}, byDate: {} };
    orgObj.total++;
    let orgTagArr = orgObj.tags[mainTag];
    if (!orgTagArr) orgObj.tags[mainTag] = orgTagArr = [];
    orgTagArr.push(lead);

    let orgOwnerArr = orgObj.owners[owner];
    if (!orgOwnerArr) orgObj.owners[owner] = orgOwnerArr = [];
    orgOwnerArr.push(lead);

    let orgDateArr = orgObj.byDate[date];
    if (!orgDateArr) orgObj.byDate[date] = orgDateArr = [];
    orgDateArr.push(lead);
  }

  document.querySelector(".loading").classList.remove("active");
  return r;
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

  RAW_DATA = await fetchLeads(initRange.from, initRange.to);

  await processAndRenderAll(RAW_DATA);
  setupTimeDropdown();
  setupAccountFilter();
  setupClearFilter();
  setupQualityFilter();
  setupLeadSearch();
}
main();
async function processAndRenderAll(data) {
  setupDropdowns();
  GROUPED = processCRMData(data);
  window.grouped = GROUPED;
  renderLeadTable(data);
  renderFilterOptions(data);
  renderLeadTrendChart(GROUPED);
  renderToplist(GROUPED);
  renderToplistBySale(GROUPED);
  renderLeadQualityMeter(GROUPED);
  renderCampaignPieChart(GROUPED);
  renderTagFrequency(GROUPED);
  renderSaleFilter(GROUPED);
  renderDegreeChart(data);
  renderProgramChart(GROUPED);
  renderLeadTagChart(GROUPED);
  // renderSaleDropdown(GROUPED);
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
  const dropdown = selectWrap.querySelector(".dom_select_show");
  const selected = selectWrap.querySelector(".dom_selected");
  const searchInput = document.querySelector(".dom_search");

  if (!grouped?.byOwner) return;

  // 🧮 Danh sách sale (ẩn mã NV)
  const sales = Object.keys(grouped.byOwner).map((n) =>
    n.replace(/\s*\(NV.*?\)/gi, "").trim()
  );

  // 🟢 Mặc định: sale đầu tiên
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
  toggle.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("active");
  };

  // 🟢 Chọn sale khác
  dropdown.querySelectorAll("li").forEach((li) => {
    li.onclick = (e) => {
      e.stopPropagation();

      dropdown
        .querySelectorAll("li")
        .forEach((el) => el.classList.remove("active"));
      dropdown
        .querySelectorAll(".radio_box")
        .forEach((r) => r.classList.remove("active"));

      li.classList.add("active");
      li.querySelector(".radio_box").classList.add("active");

      const saleName = li.querySelector("span:nth-child(2)").textContent.trim();
      selected.textContent = saleName;

      // ✅ Cập nhật biểu đồ
      renderLeadTagChartBySale(grouped, saleName);

      // ✅ Gán tên sale vào ô input
      if (searchInput) {
        searchInput.value = saleName;
      }

      // ✅ Lọc dữ liệu theo tên sale và render lại bảng
      const filtered = RAW_DATA.filter((lead) => {
        const owner = lead.OwnerIDText?.toLowerCase() || "";
        return owner.includes(saleName.toLowerCase());
      });
      renderLeadTable(filtered);

      dropdown.classList.remove("active");
    };
  });

  // 🔹 Click ngoài để đóng
  document.addEventListener("click", (e) => {
    if (!selectWrap.contains(e.target)) dropdown.classList.remove("active");
  });
}

function renderLeadTagChartBySale(grouped, saleName) {
  const ctx = document.getElementById("leadTagChartbySale");
  if (!ctx) return;

  // 🔍 Tìm đúng sale
  const matchedKey = Object.keys(grouped.byOwner).find(
    (key) => key.replace(/\s*\(NV.*?\)/gi, "").trim() === saleName
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

  // 🧮 Lấy tag & số lượng theo thứ tự cố định
  const ordered = tagOrder
    .map((tag) => ({
      label: tag,
      value: ownerData.tags?.[tag]?.count || 0,
    }))
    .filter((d) => d.value > 0);

  const filteredLabels = ordered.map((d) => d.label);
  const filteredValues = ordered.map((d) => d.value);

  // 🎨 Màu vàng cho cao nhất, còn lại xám
  const maxValue = Math.max(...filteredValues);
  const barColors = filteredValues.map((v) =>
    v === maxValue ? "#ffa900" : "#d9d9d9"
  );

  // 🔄 Update chart nếu có
  if (window.leadTagChartBySaleInstance) {
    const chart = window.leadTagChartBySaleInstance;
    chart.data.labels = filteredLabels;
    chart.data.datasets[0].data = filteredValues;
    chart.data.datasets[0].backgroundColor = barColors;
    chart.data.datasets[0].label = `Leads by Tag (${saleName})`;
    chart.update("active");
    return;
  }

  // 🚀 Tạo chart mới
  window.leadTagChartBySaleInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: filteredLabels,
      datasets: [
        {
          label: `Leads by Tag (${saleName})`,
          data: filteredValues,
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
      animation: { duration: 900, easing: "easeOutQuart" },
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
            stepSize: Math.ceil(Math.max(...filteredValues) / 4) || 1,
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v),
          },
          afterDataLimits: (scale) => (scale.max *= 1.1),
          grid: { color: "rgb(240, 240, 240)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

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
  const top_tag = document.getElementById("top_tag");
  if (!ctx) return;

  const labels = Object.keys(grouped.byTag);
  const values = labels.map((tag) => grouped.byTag[tag].length);
  const barColors = labels.map(() => "rgba(255, 162, 0, 0.9)");

  // 🔹 Gán label có giá trị lớn nhất vào top_tag
  if (top_tag && values.length) {
    const maxIndex = values.indexOf(Math.max(...values));
    top_tag.innerText = labels[maxIndex] || "";
  }

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

  // Toggle mở dropdown
  toggle.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll(".dom_select_show").forEach((u) => {
      if (u !== list) u.classList.remove("active");
    });
    list.classList.toggle("active");
  };

  // Click chọn tag
  list.querySelectorAll("li").forEach((li) => {
    li.onclick = (e) => {
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
    };
  });

  // Đóng khi click ra ngoài
  document.addEventListener("click", (e) => {
    if (!select.contains(e.target)) list.classList.remove("active");
  });
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

  // 🧮 Chuẩn bị dữ liệu
  const labels = [];
  const totalCounts = [];
  const tagCounts = [];

  Object.entries(grouped.byOwner).forEach(([owner, ownerData]) => {
    const total = ownerData.total || 0;
    const tagCount = ownerData.tags?.[tagFilter]?.count || 0;

    // ✂️ Cắt bỏ phần mã (VD: "Nguyễn Thị Linh Đan (NV0211)" -> "Nguyễn Thị Linh Đan")
    const cleanName = owner.replace(/\s*\(NV.*?\)/gi, "").trim();
    labels.push(cleanName);

    totalCounts.push(total);
    tagCounts.push(tagCount);
  });

  const ctx2d = ctx.getContext("2d");

  // 🎨 Màu sắc
  const tagColor = "rgba(38, 42, 83, 0.8)"; // Xanh đậm
  const totalColor = "rgba(255, 171, 0, 0.8)"; // Vàng
  // 🔄 Nếu chart đã có sẵn → update animation
  if (window.leadSaleChartInstance) {
    const chart = window.leadSaleChartInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = totalCounts;
    chart.data.datasets[1].data = tagCounts;
    chart.data.datasets[1].label = `${tagFilter} Leads`;
    chart.update();
    return;
  }
  const maxValue = Math.max(...totalCounts, ...tagCounts);
  const step = Math.ceil(maxValue / 5); // ⚙️ chia trục Y thành khoảng 5 đoạn
  // 🚀 Tạo chart mới
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
      interaction: { mode: "index" },
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
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#444",
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8, // ⚙️ Giới hạn tối đa số sale hiển thị
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            color: "#666",
            stepSize:
              Math.ceil(Math.max(...totalCounts, ...tagCounts) / 4) || 1,
          },
          afterDataLimits: (scale) => {
            scale.max *= 1.1; // tăng 10%
          },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
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

      // 🏷️ Tags
      let tagHtml = "-";
      if (TagIDText && TagIDText.trim() !== "") {
        const tags = TagIDText.split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        tagHtml = tags
          .map((tag) => {
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
            <td>${maskEmail(Email)}</td>
            <td><i class="fa-solid fa-phone table_phone"></i> ${maskMobile(
              Mobile
            )}</td>
            <td>${OwnerIDText.replace(/\s*\(NV.*?\)/gi, "").trim() || "-"}</td>
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

  const footer = `
      <tfoot>
        <tr>
          <td colspan="3">
            <strong>Total: ${leads.length.toLocaleString("en-US")} lead${
    leads.length > 1 ? "s" : ""
  }</strong>
          </td>
          <td colspan="${headers.length - 3}"></td>
        </tr>
      </tfoot>
    `;

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

// ======================  CHART ======================

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
          "Msc_AI UMEF",
          "MBA UMEF",
          "EMBA UMEF",
          "Unqualified",
          "Status - New",
          "Junk",
          "BBA",
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

function renderDegreeChart(grouped) {
  const ctx = document.getElementById("degreeChart");
  const top_edu = document.getElementById("top_edu");
  if (!ctx) return;

  // 🧮 Gom dữ liệu theo nhóm trình độ
  const degreeCounts = {
    "Cử nhân": 0,
    "Cao đẳng": 0,
    "Dưới cao đẳng": 0,
    THPT: 0,
    "Sinh viên": 0,
    Khác: 0,
  };

  grouped.forEach((lead) => {
    const desc = (lead.Description || "").toLowerCase().trim();

    if (/(dưới[\s_]*cao[\s_]*đẳng|duoi[\s_]*cao[\s_]*dang)/.test(desc)) {
      degreeCounts["Dưới cao đẳng"]++;
    } else if (/(cao[\s_]*đẳng|cao[\s_]*dang)/.test(desc)) {
      degreeCounts["Cao đẳng"]++;
    } else if (/\bthpt\b|trung[\s_]*học[\s_]*phổ[\s_]*thông/.test(desc)) {
      degreeCounts["THPT"]++;
    } else if (/(sinh[\s_]*viên|sinh[\s_]*vien|sinhvien)/.test(desc)) {
      degreeCounts["Sinh viên"]++;
    } else if (/(cử[\s_]*nhân|cu[\s_]*nhan)/.test(desc)) {
      degreeCounts["Cử nhân"]++;
    } else if (desc !== "") {
      degreeCounts["Khác"]++;
    }
  });

  // 🏷️ Label + Value
  const labels = Object.keys(degreeCounts);
  const values = Object.values(degreeCounts);

  // 🎨 Tô màu: cột cao nhất vàng, còn lại xám
  const maxValue = Math.max(...values);
  const barColors = values.map((v) => (v === maxValue ? "#ffa900" : "#d9d9d9"));

  // 🔹 Gán trình độ cao nhất vào top_edu
  if (top_edu && values.length) {
    const maxIndex = values.indexOf(maxValue);
    top_edu.innerText = labels[maxIndex] || "";
  }

  // 🔄 Nếu chart đã tồn tại → cập nhật
  if (window.degreeChartInstance) {
    const chart = window.degreeChartInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = barColors;
    chart.data.datasets[0].borderColor = barColors;
    chart.update("active");
    return;
  }

  // 🚀 Tạo chart mới
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
        duration: 900,
        easing: "easeOutQuart",
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
          animation: { duration: 500, easing: "easeOutBack" },
        },
      },
      scales: {
        x: {
          grid: {
            display: true,
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
            stepSize: Math.ceil(Math.max(...values) / 4) || 1,
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

function renderProgramChart(grouped) {
  const ctx = document.getElementById("programChart");
  const top_program = document.getElementById("top_program");
  if (!ctx) return;

  const freq = grouped.tagFrequency;

  const programs = {
    "MSc AI UMEF": freq["Msc_AI UMEF"] || 0,
    "MBA UMEF": freq["MBA UMEF"] || 0,
    "EMBA UMEF": freq["EMBA UMEF"] || 0,
    BBA: freq["BBA"] || 0,
    DBA: freq["DBA"] || 0,
  };

  // 🧹 Lọc bỏ những chương trình = 0
  const filtered = Object.entries(programs).filter(([_, v]) => v > 0);
  const labels = filtered.map(([k]) => k);
  const values = filtered.map(([_, v]) => v);

  // 🎨 Cột cao nhất màu vàng, còn lại xám
  const maxValue = Math.max(...values);
  const colors = values.map((v) => (v === maxValue ? "#ffa900" : "#d9d9d9"));

  // 🔹 Gán chương trình có nhiều leads nhất vào top_program
  if (top_program && values.length) {
    const maxIndex = values.indexOf(maxValue);
    top_program.innerText = labels[maxIndex] || "";
  }

  // 🔄 Nếu chart đã tồn tại → update
  if (window.programChartInstance) {
    const chart = window.programChartInstance;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = colors;
    chart.data.datasets[0].borderColor = colors;
    chart.update("active");
    return;
  }

  // 🚀 Tạo chart mới
  window.programChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Leads theo chương trình học",
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
      animation: { duration: 800, easing: "easeOutQuart" },
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
          grid: { display: true, color: "rgba(0, 0, 0, 0.05)" },
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
  console.log(grouped, currentTagFilter);

  if (!ctx) return;

  const dates = Object.keys(grouped.byDate).sort();

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
        legend: false,
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} leads`,
          },
        },
      },
      scales: {
        x: { ticks: { color: "#555" }, grid: { color: "rgba(0,0,0,0.05)" } },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          afterDataLimits: (scale) => (scale.max *= 1.1),
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
function renderToplistBySale(grouped) {
  renderSaleDropdown();

  const wrap = document.querySelector(".dom_toplist_wrap .dom_toplist.sale");
  const dashboard = document.querySelector(".dom_dashboard");
  const saleDetailUI = document.querySelector(".sale_report");
  const dateUI = document.querySelector(".dom_date");

  if (!wrap || !grouped?.byOwner || !dashboard || !saleDetailUI || !dateUI)
    return;

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

  // 🔹 Click nút ba chấm → filter và show sale_detail
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
