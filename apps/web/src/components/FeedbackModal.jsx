import React, { useState } from "react";
import Modal from "./Modal";
import { Bug, Send, CheckCircle } from "lucide-react";

export default function FeedbackModal({ isOpen, onClose, theme }) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    // Simulate API call
    console.log("[FEEDBACK-DEBUG] Bug report submitted:", feedback);
    await new Promise((r) => setTimeout(r, 1500));
    
    setIsSuccess(true);
    setIsSubmitting(false);
    setFeedback("");
    
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Report a bug"
      theme={theme}
    >
      {isSuccess ? (
        <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in zoom-in duration-300">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle size={32} />
          </div>
          <h3 className="text-lg font-black text-sam-text">Report Received</h3>
          <p className="mt-2 text-xs font-medium text-sam-text-muted uppercase tracking-widest">Our engineers are on it.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex items-start gap-4 rounded-xl bg-amber-500/10 p-4 border border-amber-500/20">
            <Bug className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed text-amber-500/70 font-medium uppercase tracking-widest">
              HELP US IMPROVE SAM. DESCRIBE THE ISSUE, STEPS TO REPRODUCE, AND YOUR ENVIRONMENT.
            </p>
          </div>

          <textarea
            required
            placeholder="What went wrong?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="sam-input min-h-[150px] w-full resize-none py-4 text-sm font-medium leading-relaxed"
          />

          <button
            type="submit"
            disabled={isSubmitting || !feedback.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sam-text px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-sam-bg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <>
                <Send size={14} />
                Transmit Report
              </>
            )}
          </button>
        </form>
      )}
    </Modal>
  );
}
