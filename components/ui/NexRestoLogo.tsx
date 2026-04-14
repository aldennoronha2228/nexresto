import Image from 'next/image';

type NexRestoLogoProps = {
    variant?: 'mark' | 'full';
    className?: string;
    priority?: boolean;
};

const logoVersion = '20260415a';

export default function NexRestoLogo({ variant = 'mark', className, priority = false }: NexRestoLogoProps) {
    if (variant === 'full') {
        return (
            <Image
                src={`/nexresto-mark.svg?v=${logoVersion}`}
                alt="NexResto"
                width={64}
                height={64}
                className={className}
                priority={priority}
                unoptimized
            />
        );
    }

    return (
        <Image
            src={`/nexresto-mark.svg?v=${logoVersion}`}
            alt="NexResto"
            width={64}
            height={64}
            className={className}
            priority={priority}
            unoptimized
        />
    );
}
