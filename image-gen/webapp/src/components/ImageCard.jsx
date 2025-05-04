import React, { useState } from 'react'
import { 
  Card, 
  CardMedia, 
  CardActions, 
  IconButton, 
  Tooltip,
  Zoom
} from '@mui/material'
import FavoriteIcon from '@mui/icons-material/Favorite'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import InfoIcon from '@mui/icons-material/Info'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import MetadataOverlay from './MetadataOverlay'
import ImageModal from './ImageModal'
import { formatDate } from '../services/api'

const ImageCard = ({ image, toggleFavorite, isNew }) => {
  const [showMetadata, setShowMetadata] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const handleToggleMetadata = (e) => {
    e.stopPropagation() // Prevent card click event
    setShowMetadata(!showMetadata)
  }

  const handleOpenModal = () => {
    // Only open the modal if metadata overlay is not showing
    if (!showMetadata) {
      setShowModal(true)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
  }

  const handleMetadataClose = () => {
    setShowMetadata(false)
  }

  // Ensure the image URL is valid
  const imageUrl = image.imageUrl || image.url || '';

  return (
    <Zoom in={true} style={{ transitionDelay: isNew ? '300ms' : '0ms' }}>
      <Card 
        sx={{ 
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          '&:hover .card-actions': {
            opacity: 1
          },
          cursor: 'pointer',
          minHeight: { xs: '200px', sm: '220px', md: '240px' }, // Minimum height for different screen sizes
          animation: isNew ? 'pulse 1.5s' : 'none',
          '@keyframes pulse': {
            '0%': {
              boxShadow: '0 0 0 0 rgba(25, 118, 210, 0.7)',
            },
            '70%': {
              boxShadow: '0 0 0 10px rgba(25, 118, 210, 0)',
            },
            '100%': {
              boxShadow: '0 0 0 0 rgba(25, 118, 210, 0)',
            },
          },
        }}
        onClick={handleOpenModal}
      >
        <CardMedia
          component="img"
          image={imageUrl} // Ensure this is a valid URL
          alt={image.prompt || "Generated image"}
          sx={{
            width: '100%', // Ensure the image takes the full width of the card
            height: '100%', // Take full height of card
            objectFit: 'cover', // Ensure the image fits properly
            minHeight: { xs: '180px', sm: '200px', md: '220px' }, // Minimum height for different screen sizes
          }}
        />
        
        <CardActions 
          className="card-actions"
          sx={{ 
            position: 'absolute',
            bottom: 0,
            right: 0,
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            opacity: 0,
            transition: 'opacity 0.3s',
            borderTopLeftRadius: 8
          }}
          onClick={(e) => e.stopPropagation()} // Prevent card click when clicking actions
        >
          <Tooltip title="View larger">
            <IconButton 
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal();
              }}
              sx={{ color: 'white' }}
            >
              <ZoomInIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="View details">
            <IconButton 
              onClick={handleToggleMetadata}
              sx={{ color: 'white' }}
            >
              <InfoIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title={image.isFavorite ? "Remove from favorites" : "Add to favorites"}>
            <IconButton 
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(image.id);
              }}
              sx={{ color: 'white' }}
            >
              {image.isFavorite ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}
            </IconButton>
          </Tooltip>
        </CardActions>
        
        {showMetadata && (
          <MetadataOverlay
            open={showMetadata}
            onClose={handleMetadataClose}
            image={image}
            formattedDate={formatDate(image.timestamp)}
          />
        )}

        <ImageModal
          open={showModal}
          onClose={handleCloseModal}
          image={image}
        />
      </Card>
    </Zoom>
  );
};

export default ImageCard;
