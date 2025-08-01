"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";
import databaseUtils from "../../lib/database";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import NoEntriesState from "../components/NoEntriesState";
import SignInPrompt from "../components/SignInPrompt";
import { useRouter } from "next/navigation";

const stripHtml = (html) => {
  if (typeof window === "undefined") return "";
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
};

const getOrdinalSuffix = (day) => {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

const formatDateTime = (dateInput) => {
  const date = new Date(dateInput || Date.now());
  const day = date.getDate();
  const ordinalDay = day + getOrdinalSuffix(day);
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${ordinalDay} ${month} ${year} | ${time}`;
};

// Function to strip HTML and format preview
const generatePreview = (content) => {
  if (!content) return { text: "", imageUrl: null };
  
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  
  // Remove script and style elements
  const scripts = tempDiv.getElementsByTagName('script');
  const styles = tempDiv.getElementsByTagName('style');
  while(scripts[0]) scripts[0].parentNode.removeChild(scripts[0]);
  while(styles[0]) styles[0].parentNode.removeChild(styles[0]);
  
  // Add size constraints to images
  const images = tempDiv.getElementsByTagName('img');
  for (let img of images) {
    img.style.maxWidth = '150px';
    img.style.maxHeight = '100px';
    img.style.objectFit = 'cover';
    img.style.margin = '0.5rem 0';
  }
  
  // Get text content
  let textContent = tempDiv.textContent || tempDiv.innerText;
  
  // Handle videos
  const videos = tempDiv.getElementsByTagName('video');
  if (videos.length > 0) {
    textContent = `[${videos.length} video${videos.length > 1 ? 's' : ''}] ${textContent}`;
  }
  
  // Split into lines and take first 5
  const lines = textContent.split('\n').filter(line => line.trim());
  const previewLines = lines.slice(0, 5);
  
  // Join lines with proper spacing
  return {
    text: previewLines.join('\n'),
    content: tempDiv.innerHTML // Keep the HTML content for proper image rendering
  };
};

export default function JournalPage() {
  const [processedEntries, setProcessedEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(10);
  const [selectedEntries, setSelectedEntries] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { user, toggleAuthModal } = useAuth();
  const [entries, setEntries] = useState([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [draftsCount, setDraftsCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthChecked(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        // Load journal entries
        const journalEntries = await databaseUtils.getJournalEntries(user.id);
        setEntries(journalEntries || []);

        // Count drafts
        const drafts = JSON.parse(localStorage.getItem(`journal_drafts_${user.id}`) || '[]');
        setDraftsCount(drafts.length);

      } catch (error) {
        console.error("Error loading journal entries:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Refresh draft count when page becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        const drafts = JSON.parse(localStorage.getItem(`journal_drafts_${user.id}`) || '[]');
        setDraftsCount(drafts.length);
      }
    };

    const handleFocus = () => {
      if (user) {
        const drafts = JSON.parse(localStorage.getItem(`journal_drafts_${user.id}`) || '[]');
        setDraftsCount(drafts.length);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  useEffect(() => {
    async function loadEntries() {
      setLoading(true);
      try {
        let entries = [];

        if (user) {
          const cloudEntries = await databaseUtils.getJournalEntries(user.id);
          entries = cloudEntries;
        } else if (typeof window !== "undefined") {
          entries = JSON.parse(localStorage.getItem("journalEntries") || "[]");
        }

        const processed = entries.map((entry) => ({
          ...entry,
          preview: generatePreview(entry.content),
          dateTime: formatDateTime(entry.timestamp || entry.date || Date.now()),
        }));

        setProcessedEntries(processed);
      } catch (error) {
        console.error("Error loading entries:", error);
      } finally {
        setLoading(false);
      }
    }

    loadEntries();
  }, [user]);

  const totalPages = Math.ceil(processedEntries.length / entriesPerPage);

  const handleToggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedEntries(new Set()); // Clear selections when toggling mode
  };

  const handleDeleteSelected = async () => {
    if (!user || selectedEntries.size === 0) return;
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    try {
      const entriesToDelete = Array.from(selectedEntries);
      const success = await databaseUtils.deleteManyJournalEntries(user.id, entriesToDelete);
      
      if (success) {
        setProcessedEntries(entries => 
          entries.filter(entry => !selectedEntries.has(entry.id))
        );
        setSelectedEntries(new Set());
        setIsSelectionMode(false); // Exit selection mode after successful deletion
        
        // Reset current page if it's now out of bounds
        const newTotalPages = Math.ceil((processedEntries.length - selectedEntries.size) / entriesPerPage);
        if (currentPage > newTotalPages) {
          setCurrentPage(newTotalPages || 1);
        }
      } else {
        throw new Error('Failed to delete entries');
      }
    } catch (error) {
      console.error("Error deleting entries:", error);
      alert("Failed to delete entries. Please try again.");
    } finally {
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <main className="max-w-4xl mx-auto pt-24 px-4">
          <div className="flex justify-center items-center h-64">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-primary/60 animate-pulse"></div>
              <div className="w-3 h-3 rounded-full bg-primary/60 animate-pulse delay-150"></div>
              <div className="w-3 h-3 rounded-full bg-primary/60 animate-pulse delay-300"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show sign in prompt if not authenticated
  if (!user) {
    return <SignInPrompt type="Journal" />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        itemType={`${selectedEntries.size} ${selectedEntries.size === 1 ? 'entry' : 'entries'}`}
      />
      <main className="max-w-4xl mx-auto pt-24 px-4 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-white">My Journal</h1>
            {draftsCount > 0 && (
              <Link
                href="/journal/draft"
                className="text-red-500 hover:text-red-400 transition-colors flex items-center gap-1"
              >
                <span>Drafts</span>
                <span className="bg-red-100 text-red-500 px-2 py-0.5 rounded text-sm">
                  {draftsCount}
                </span>
              </Link>
            )}
          </div>
          <Link
            href="/journal/new"
            onClick={() => {
              if (user) {
                sessionStorage.setItem(`journal_new_session_${user.id}`, 'true');
              }
            }}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-all"
          >
            <FiPlus size={18} />
            <span className="hidden sm:inline">New Entry</span>
          </Link>
        </div>

        {processedEntries.length === 0 ? (
          <NoEntriesState type="Journal" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5">
              {processedEntries
                .slice(
                  (currentPage - 1) * entriesPerPage,
                  currentPage * entriesPerPage
                )
                .map((entry) => (
                  <div
                    key={entry.id || entry.timestamp}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                  >
                    <div className="bg-gray-800 border-b border-gray-700 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isSelectionMode && (
                            <input
                              type="checkbox"
                              checked={selectedEntries.has(entry.id)}
                              onChange={(e) => {
                                const newSelected = new Set(selectedEntries);
                                if (e.target.checked) {
                                  newSelected.add(entry.id);
                                } else {
                                  newSelected.delete(entry.id);
                                }
                                setSelectedEntries(newSelected);
                              }}
                              className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                            />
                          )}
                          <h2 className="text-lg font-semibold text-white">
                            {entry.title}
                          </h2>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400">
                          <span>{entry.dateTime}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <Link
                        href={`/journal/${entry.id}`}
                        className="block"
                      >
                        <div className="prose prose-gray max-w-none text-gray-800">
                          <div
                            className="line-clamp-5 [&_img]:max-w-[200px] [&_img]:max-h-[150px] [&_img]:object-cover [&_img]:my-2"
                            dangerouslySetInnerHTML={{ __html: entry.preview.content }}
                          />
                        </div>
                      </Link>
                    </div>
                  </div>
                ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(processedEntries.length / entriesPerPage)}
              onPageChange={(page) => setCurrentPage(page)}
            />
          </>
        )}
      </main>

    </div>
  );
}

// Pagination component remains the same as in the previous code
function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    pages.push(1);
    
    if (currentPage > 3) {
      pages.push('...');
    }
    
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(currentPage + 1, totalPages - 1); i++) {
      pages.push(i);
    }
    
    if (currentPage < totalPages - 2) {
      pages.push('...');
    }
    
    pages.push(totalPages);
  }
  
  return pages;
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  const pages = getPageNumbers(currentPage, totalPages);
  
  return (
    <div className="flex justify-center items-center gap-2 mt-8 mb-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-2 rounded-md bg-gray-900 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
      >
        Previous
      </button>
      
      <div className="flex gap-1">
        {pages.map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-3 py-2 text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              disabled={page === currentPage}
              className={`px-3 py-2 rounded-md transition-colors ${
                page === currentPage
                  ? 'bg-primary text-white'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {page}
            </button>
          )
        ))}
      </div>
      
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-2 rounded-md bg-gray-900 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
      >
        Next
      </button>
    </div>
  );
}