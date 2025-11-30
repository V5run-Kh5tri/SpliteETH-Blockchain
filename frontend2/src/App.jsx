  import { useEffect, useState } from "react";
  import { ethers } from "ethers";

  const CONTRACT_ABI = [
    "function createBill(string _description, address[] _participants) external payable returns (uint256)",
    "function payShare(uint256 _billId) external payable",
    "function withdrawFunds(uint256 _billId) external",
    "function getBill(uint256 _billId) external view returns (address creator, string description, uint256 totalAmount, uint256 amountPerPerson, address[] participants, uint256 totalPaid, bool isActive)",
    "function hasPaid(uint256 _billId, address _user) external view returns (bool)",
    "function allPaid(uint256 _billId) external view returns (bool)",
    "function billCounter() external view returns (uint256)",
    "event BillCreated(uint256 indexed billId, address indexed creator, string description, uint256 totalAmount, uint256 participantCount)",
  ];

  const NETWORKS = {
    31337: { name: "Localhost", explorer: "http://localhost:8545" },
    11155111: { name: "Sepolia", explorer: "https://sepolia.etherscan.io" },
    80001: { name: "Mumbai", explorer: "https://mumbai.polygonscan.com" },
    137: { name: "Polygon", explorer: "https://polygonscan.com" },
  };

  const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  export default function App() {
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);
    const [wallet, setWallet] = useState(null);

    const [tab, setTab] = useState("create");

    const [description, setDescription] = useState("");
    const [totalAmount, setTotalAmount] = useState("");
    const [totalAmountRaw, setTotalAmountRaw] = useState("");
    const [currencyType, setCurrencyType] = useState("INR");
    const [people, setPeople] = useState([""]);

    const [status, setStatus] = useState(null);

    const [bills, setBills] = useState([]);
    const [selectedBill, setSelectedBill] = useState(null);
    const [exchangeData, setExchangeData] = useState({});

    const [loading, setLoading] = useState(false);


    // Load Exchange Rates

    useEffect(()=>{
      fetch("https://api.coinbase.com/v2/exchange-rates?currency=ETH")
      .then((response) => response.json())
      .then((data) => setExchangeData(data.data.rates));
    },[])


    // --------------------------
    // Connect Wallet
    // --------------------------
    const connectWallet = async () => {
      if (!window.ethereum) return showStatus("Install MetaMask!", "error");

      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });

        const _provider = new ethers.providers.Web3Provider(window.ethereum);
        const _signer = _provider.getSigner();
        const address = await _signer.getAddress();

        const network = await _provider.getNetwork();

        setProvider(_provider);
        setSigner(_signer);
        setWallet({
          address,
          networkName: NETWORKS[network.chainId]?.name || `Chain ${network.chainId}`,
          explorer: NETWORKS[network.chainId]?.explorer,
        });

        setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _signer));

        showStatus("Wallet connected!", "success");

        window.ethereum.on("accountsChanged", () => window.location.reload());
        window.ethereum.on("chainChanged", () => window.location.reload());
      } catch (err) {
        showStatus("Failed to connect wallet", "error");
      }
    };

    // --------------------------
    // Show status
    // --------------------------
    const showStatus = (msg, type) => {
      setStatus({ msg, type });
      if (type !== "info") {
        setTimeout(() => setStatus(null), 3500);
      }
    };

    // --------------------------
    // Add person input
    // --------------------------
    const addPerson = () => {
      setPeople([...people, ""]);
    };

    const updatePerson = (i, value) => {
      const updated = [...people];
      updated[i] = value;
      setPeople(updated);
    };

    // --------------------------
    // Create Bill
    // --------------------------
    const createBill = async () => {
      if (!contract) return showStatus("Connect wallet first!", "error");

      if (!description || !totalAmount) return showStatus("Fill required fields!", "error");

      const validAddresses = people.filter(
        (p) => p.trim() !== "" && ethers.utils.isAddress(p.trim())
      );

      if (validAddresses.length === 0)
        return showStatus("Add at least one valid address!", "error");

      try {
        showStatus("Creating bill… confirm transaction", "info");

        const tx = await contract.createBill(description, validAddresses, {
          value: ethers.utils.parseEther(totalAmount),
        });

        await tx.wait();
        showStatus("Bill created!", "success");

        setDescription("");
        setTotalAmount("");
        setTotalAmountRaw("");
        setPeople([""]);

        setTab("view");
        loadBills();
      } catch (err) {
        showStatus("Transaction failed!", "error");
      }
    };

    // --------------------------
    // Load user’s bills
    // --------------------------
    const loadBills = async () => {
      if (!contract || !wallet) return;

      const counter = await contract.billCounter();
      const myBills = [];

      for (let i = 0; i < counter.toNumber(); i++) {
        const bill = await contract.getBill(i);
        const [creator, desc, total, perPerson, participants] = bill;

        const involved =
          creator.toLowerCase() === wallet.address.toLowerCase() ||
          participants.some((p) => p.toLowerCase() === wallet.address.toLowerCase());

        if (involved) {
          myBills.push({ id: i, data: bill });
        }
      }

      setBills(myBills);
    };

    // --------------------------
    // View Details
    // --------------------------
    const openBill = async (id) => {
      const bill = await contract.getBill(id);
      setSelectedBill({ id, data: bill });
    };

    const payShare = async (billId) => {
      try {
        setLoading(true);
        const bill = await contract.getBill(billId);
        const amount = bill[3];

        showStatus("Confirm payment…", "info");

        const tx = await contract.payShare(billId, { value: amount });
        await tx.wait();

        showStatus("Payment successful!", "success");
        openBill(billId);
      } catch (err) {
        console.log(err);
        showStatus("Payment failed: " + (err.reason || err.message), "error");
      }
      setLoading(false);
    };


    const withdraw = async (billId) => {
      try {
        setLoading(true);
        showStatus("Confirm withdrawal…", "info");

        const tx = await contract.withdrawFunds(billId);
        await tx.wait();

        showStatus("Withdrawn!", "success");
        openBill(billId);
      } catch (err) {
        console.log(err);
        showStatus("Withdrawal failed: " + (err.reason || err.message), "error");
      }
      setLoading(false);
    };


    useEffect(() => {
      if (wallet && contract) {
        loadBills();
      }
    }, [wallet, contract]);

    // --------------------------
    // UI Start
    // --------------------------
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-400 to-purple-600 p-6 flex justify-center">
        <div className="bg-white max-w-2xl w-full p-8 rounded-2xl shadow-2xl">

          <h1 className="text-3xl font-bold text-indigo-500 text-center">SplitETH </h1>
          <p className="text-center text-gray-500 mb-6">Decentralized Bill Splitter</p>

          {/* Connect Wallet */}
          {!wallet ? (
            <button
              className="w-full bg-indigo-500 text-white py-3 rounded-lg font-semibold"
              onClick={connectWallet}
            >
              Connect Wallet
            </button>
          ) : (
            <div className="p-4 bg-gray-100 rounded-lg text-center">
              <div className="font-semibold">Connected</div>
              <div className="text-indigo-500 text-sm font-mono">{wallet.address}</div>
              <div className="text-xs text-gray-600">Network: {wallet.networkName}</div>
            </div>
          )}

          {/* Contract Link */}
          {wallet && (
            <div className="mt-4 text-sm text-center bg-blue-50 p-3 rounded-lg">
              Contract:
              <a
                href={`${wallet.explorer}/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                className="ml-1 text-blue-600 font-mono"
              >
                {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
              </a>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setTab("create")}
              className={`flex-1 py-2 rounded-lg font-semibold ${
                tab === "create" ? "bg-indigo-500 text-white" : "bg-gray-100"
              }`}
            >
              Create Bill
            </button>
            <button
              onClick={() => setTab("view")}
              className={`flex-1 py-2 rounded-lg font-semibold ${
                tab === "view" ? "bg-indigo-500 text-white" : "bg-gray-100"
              }`}
            >
              My Bills
            </button>
          </div>

          {/* Status */}
          {status && (
            <div
              className={`mt-4 p-3 rounded-lg text-center text-sm ${
                status.type === "success"
                  ? "bg-green-100 text-green-700"
                  : status.type === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {status.msg}
            </div>
          )}

          {/* CREATE TAB */}
          {tab === "create" && (
            <div className="mt-6">
              <label className="font-semibold">Bill Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 mt-1 mb-4 border rounded-lg"
                placeholder="Team Dinner"
              />
              
              <label className="font-semibold inline mr-5">Select Currency Type</label>
              <select
                value={currencyType}
                onChange={(e) => setCurrencyType(e.target.value)}
                placeholder="Currency Type"
                className="bg-gray-300 rounded-xl py-1 pl-2 pr-2"
              >
                {Object.keys(exchangeData).map(key => {
                  return <option key={key} value={key}>{key}</option>
                })}
              </select>
              
              <label className="font-semibold mt-4 block">Total Amount ({currencyType})</label>
              <input
                value={totalAmountRaw}
                onChange={async (e) => {
                  const val = e.target.value;
                  setTotalAmountRaw(val);

                  if (exchangeData[currencyType]) {
                    // Convert fiat → ETH using BigNumber-safe method
                    const rate = exchangeData[currencyType];   // Example: "204523.12" INR per ETH

                    // Convert using JS number (allowed) but then BigNumber to fix precision
                    const ethFloat = Number(val) / Number(rate);

                    // Convert float -> BigNumber (avoids floating errors)
                    const preciseBN = ethers.utils.parseUnits(ethFloat.toString(), 18);

                    // Convert back to exact decimal string
                    const formatted = ethers.utils.formatUnits(preciseBN, 18);

                    setTotalAmount(formatted);
                  }
                }}

                className="w-full p-3 mt-1 border rounded-lg"
                placeholder="0.1"
              />

              <label className="font-semibold mt-4 block">Total Amount (ETH)</label>
              <input
                value={totalAmount}
                className="w-full p-3 mt-1 border rounded-lg"
                placeholder="0.1"
                disabled
              />

              <label className="font-semibold mt-4 block">Participants</label>

              {people.map((p, i) => (
                <input
                  key={i}
                  value={p}
                  onChange={(e) => updatePerson(i, e.target.value)}
                  className="w-full p-3 mt-2 border rounded-lg font-mono"
                  placeholder="0x..."
                />
              ))}

              <button
                onClick={addPerson}
                className="w-full mt-3 bg-green-500 text-white py-2 rounded-lg font-semibold"
              >
                + Add Person
              </button>

              <button
                onClick={createBill}
                className="w-full mt-6 bg-indigo-500 text-white py-3 rounded-lg font-semibold"
              >
                Create Bill
              </button>
            </div>
          )}

          {/* VIEW TAB */}
          {tab === "view" && (
            <div className="mt-6">
              {bills.length === 0 ? (
                <p className="text-center text-gray-400">No bills found</p>
              ) : (
                bills.map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => openBill(bill.id)}
                    className="p-4 bg-gray-100 rounded-lg mb-3 cursor-pointer hover:bg-gray-200"
                  >
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 font-mono">
                        Bill #{bill.id}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          bill.data[6] ? "bg-green-500 text-white" : "bg-gray-400 text-white"
                        }`}
                      >
                        {bill.data[6] ? "Active" : "Completed"}
                      </span>
                    </div>
                    <div className="font-semibold">{bill.data[1]}</div>
                    <div className="text-sm text-gray-600">
                      Total: {ethers.utils.formatEther(bill.data[2])} ETH
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* BILL DETAILS */}
          {selectedBill && (
            <div className="mt-6 p-4 border rounded-xl bg-gray-50">
              <button
                onClick={() => setSelectedBill(null)}
                className="text-sm bg-gray-300 px-3 py-1 rounded"
              >
                ← Back
              </button>

              <h2 className="text-xl font-bold mt-3">{selectedBill.data[1]}</h2>
              <p className="text-sm mt-1 font-mono">
                Bill #{selectedBill.id}
              </p>

              <div className="mt-3">
                <div>Total: {ethers.utils.formatEther(selectedBill.data[2])} ETH</div>
                <div>Per Person: {ethers.utils.formatEther(selectedBill.data[3])} ETH</div>
                <div>Collected: {ethers.utils.formatEther(selectedBill.data[5])} ETH</div>
              </div>

              <h3 className="mt-4 font-semibold">Participants</h3>

              {selectedBill.data[4].map((addr, idx) => (
                <div
                  key={idx}
                  className="p-3 mt-2 bg-white rounded-lg border flex justify-between"
                >
                  <span className="font-mono">{addr}</span>
                </div>
              ))}

              {/* PAY BUTTON */}
              <button
                className="w-full mt-4 bg-green-500 text-white py-2 rounded-lg"
                onClick={() => payShare(selectedBill.id)}
              >
                Pay My Share
              </button>

              {/* WITHDRAW */}
              <button
                className="w-full mt-2 bg-orange-500 text-white py-2 rounded-lg curosr-pointer "
                onClick={() => withdraw(selectedBill.id)}
              >
                Withdraw
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
