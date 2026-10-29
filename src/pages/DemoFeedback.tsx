import { useParams } from 'react-router-dom';
import { FeedbackForm } from '@/components/DemoFeedbackForm';

/** Public page (no login): the student opens the link the sales rep shared and fills the demo review. */
export default function DemoFeedbackPage() {
  const { token = '' } = useParams();
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 sm:p-8">
      <div className="bg-white text-gray-900 rounded-2xl shadow-lg w-full max-w-xl p-6"><FeedbackForm token={token} /></div>
    </div>
  );
}
