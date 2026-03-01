'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { revokeRelationship } from '../../actions/relationships';

interface Props {
  relationshipId: string;
}

export function RevokeButton({ relationshipId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleRevoke() {
    setIsPending(true);
    await revokeRelationship(relationshipId);
    setIsPending(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-gray-600">Remove?</span>
        <button
          onClick={() => void handleRevoke()}
          disabled={isPending}
          className="font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          {isPending ? '...' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-gray-500 hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-red-500 hover:underline">
      Revoke
    </button>
  );
}
