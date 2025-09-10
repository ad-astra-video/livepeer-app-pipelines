import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  IconButton, 
  Box, 
  Typography,
  Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { formatDate } from '../services/api';

const ImageModal = ({ open, onClose, image }) => {
  // Simplify the close handling
  const handleCloseModal = (event) => {
    // Prevent event propagation to ensure it doesn't interfere with parent components
    if (event) {
      event.stopPropagation();
    }
    
    console.log('Close modal called');
    
    // Check if onClose is a function before calling it
    if (typeof onClose === 'function') {
      onClose();
    } else {
      console.error('onClose is not a function:', onClose);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        console.log('Copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  // Return null if no image is provided
  if (!image) return null;

  // Ensure the image URL is valid
  const imageUrl = image.imageUrl || image.url || '';
  const formattedDate = formatDate(image.timestamp);

  const MetadataItem = ({ label, value, copyable = false }) => (
    <Box sx={{ mb: 1, minWidth: '200px' }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        <Typography 
          variant="body2" 
          sx={{ 
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap'
          }}
        >
          {value}
        </Typography>
        {copyable && (
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(value);
            }}
            sx={{ ml: 0.5 }}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );

  return (
    <Dialog 
      open={open}
      onClose={handleCloseModal}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          height: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
      onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling up
    >
      <Box sx={{ position: 'relative' }}>
        <IconButton
          aria-label="close"
          onClick={handleCloseModal}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: 'white',
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 2,
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.7)',
            }
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent 
        sx={{ 
          p: 0, 
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        }}
      >
        {/* Image Container */}
        <Box 
          sx={{ 
            height: '80%',
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: '#000',
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: '4px',
            },
          }}
        >
          <img 
            src={imageUrl} 
            alt={image.prompt || "Generated image"}
            style={{
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: 'contain',
            }}
          />
        </Box>

        {/* Metadata Container */}
        <Paper 
          elevation={3}
          sx={{ 
            height: '20%',
            overflow: 'auto',
            p: 2,
            borderTop: '1px solid rgba(0, 0, 0, 0.12)',
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '4px',
            },
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <MetadataItem 
              label="Prompt" 
              value={image.prompt} 
              copyable
            />
            
            {image.negative_prompt && (
              <MetadataItem 
                label="Negative Prompt" 
                value={image.negative_prompt} 
                copyable
              />
            )}
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              <MetadataItem 
                label="Steps" 
                value={image.num_inference_steps} 
              />
              <MetadataItem 
                label="CFG Scale" 
                value={image.guidance_scale} 
              />
              <MetadataItem 
                label="Seed" 
                value={image.seed} 
                copyable
              />
              <MetadataItem 
                label="Generated" 
                value={formattedDate} 
              />
            </Box>
          </Box>
        </Paper>
      </DialogContent>
    </Dialog>
  );
};

export default ImageModal;
